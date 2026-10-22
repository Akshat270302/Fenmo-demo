const { createHash } = require("crypto");
const { env, hasGeminiCredentials } = require("../config/env");
const { getClient, generateContent } = require("./gemini.client");
const { executeTool, toolDeclarations, ToolInputError, toLocalToday } = require("./chat.tools");

const MAX_TOOL_ITERATIONS = 6;
const MAX_HISTORY_MESSAGES = 24;
const MAX_MESSAGE_LENGTH = 2000;

const SYSTEM_INSTRUCTION = [
  "You are Fenmo's expense assistant. You help the user track and understand their spending using the expense tools.",
  "",
  "Rules you must follow:",
  "- Always call `query_expenses` before stating any total, count, or comparison. Never state a number you did not receive from a tool.",
  "- Never invent, estimate, or extrapolate transaction records, totals, or dates.",
  "- To create an expense, call `create_expense` with the amount, category, and date the user gave. If the amount or category is missing, ask a short follow-up question instead of guessing.",
  "- When the user says 'yesterday', 'this month', 'last month', or similar, pass the matching `period` value to `query_expenses` rather than computing dates yourself.",
  "- Only use categories that exist. The tool returns `availableCategories`; if a requested category is not present, use the closest real one or ask the user.",
  "- If two periods need comparing, call `query_expenses` once per period and compare the two returned totals.",
  "- Answer in the user's currency (INR) and keep replies concise. Format amounts as ₹123.45.",
  "- If a tool returns an error, explain what is missing and ask the user for the missing detail. Do not retry the same failing call more than once.",
].join("\n");

const buildIdempotencyKey = (
  sessionId,
  turnId,
  toolName,
  args,
  occurrenceIndex = 0
) => {
  return createHash("sha256")
    .update(
      [
        sessionId,
        turnId || "no-turn",
        toolName,
        canonicalizeArgs(args),
        String(occurrenceIndex),
      ].join("|")
    )
    .digest("hex")
    .slice(0, 40);
};

/**
 * Produces a stable string representation of tool arguments so the same
 * logical call always hashes to the same idempotency key.
 */
const canonicalizeArgs = (args) => {
  if (!args || typeof args !== "object") {
    return "{}";
  }

  const sorted = {};
  Object.keys(args)
    .sort()
    .forEach((key) => {
      sorted[key] = args[key];
    });

  return JSON.stringify(sorted);
};

const sanitizeHistory = (history) => {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim()
    )
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content.slice(0, MAX_MESSAGE_LENGTH) }],
    }));
};

const extractFunctionCalls = (response) => {
  const candidate = response?.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  return parts
    .filter((part) => part && part.functionCall)
    .map((part) => ({
      name: part.functionCall.name,
      args: part.functionCall.args || {},
      id: part.functionCall.id || null,
      rawPart: part,
    }));
};

const extractText = (response) => {
  const candidate = response?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts
    .filter((part) => part && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();

  return text || "";
};

/**
 * Runs the bounded tool-calling loop for a single user turn.
 *
 * Every function call is executed by a server-side handler, and the result is
 * fed back to the model as a `functionResponse` part so the model can continue
 * reasoning with real data.
 */
const runAgent = async ({ message, history, sessionId, turnId }) => {
  if (!hasGeminiCredentials()) {
    const err = new Error(
      "Gemini is not configured. Set GEMINI_API_KEY in backend/.env."
    );
    err.code = "GEMINI_NOT_CONFIGURED";
    throw err;
  }

  const trimmedMessage = String(message || "").trim();
  if (!trimmedMessage) {
    const err = new Error("Message is required");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const client = await getClient();

  const contents = sanitizeHistory(history);
  contents.push({
    role: "user",
    parts: [{ text: trimmedMessage.slice(0, MAX_MESSAGE_LENGTH) }],
  });

  const toolCalls = [];
  const createdExpenses = [];
  let iterations = 0;
  let finalText = "";

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations += 1;

    // eslint-disable-next-line no-await-in-loop
    const response = await generateContent(client, {
      model: env.gemini.model,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: toolDeclarations }],
        automaticFunctionCalling: { disable: true },
      },
    });

    const functionCalls = extractFunctionCalls(response);

    if (functionCalls.length === 0) {
      finalText = extractText(response);
      break;
    }

    // Echo the model's turn (with its functionCall parts) back into the
    // conversation before sending the function responses.
    //
    // The `thoughtSignature` and the function call `id` MUST be preserved
    // verbatim: Gemini 3.x rejects a request whose echoed functionCall parts
    // are missing their signature.
    const modelParts = (
      response?.candidates?.[0]?.content?.parts || []
    )
      .map((part) => {
        if (part && part.functionCall) {
          const echoed = {
            functionCall: {
              name: part.functionCall.name,
              args: part.functionCall.args || {},
            },
          };

          if (part.functionCall.id) {
            echoed.functionCall.id = part.functionCall.id;
          }
          if (part.thoughtSignature) {
            echoed.thoughtSignature = part.thoughtSignature;
          }

          return echoed;
        }
        if (part && typeof part.text === "string") {
          return { text: part.text };
        }
        return null;
      })
      .filter(Boolean);

    const responseParts = [];
    // Tracks how many times the same tool was called with the same arguments in
    // this turn, so two genuinely different calls in one message do not
    // collide on the same idempotency key.
    const occurrenceCounters = new Map();

    for (const call of functionCalls) {
      const occurrenceKey = `${call.name}|${canonicalizeArgs(call.args)}`;
      const occurrenceIndex = occurrenceCounters.get(occurrenceKey) || 0;
      occurrenceCounters.set(occurrenceKey, occurrenceIndex + 1);

      const idempotencyKey = buildIdempotencyKey(
        sessionId,
        turnId,
        call.name,
        call.args,
        occurrenceIndex
      );

      // The reference date is derived from the server clock, never from the
      // model, so period windows cannot be manipulated by the model.
      const toolContext = {
        idempotencyKey,
        referenceDate: toLocalToday(),
      };

      let payload;
      try {
        // eslint-disable-next-line no-await-in-loop
        payload = await executeTool(call.name, call.args, toolContext);
      } catch (err) {
        const isValidation =
          err instanceof ToolInputError || err?.name === "ToolInputError";

        payload = {
          ok: false,
          error: {
            code: isValidation ? err.code || "VALIDATION_ERROR" : "TOOL_ERROR",
            message: isValidation
              ? err.message
              : "The tool could not complete the request.",
          },
        };

        if (!isValidation) {
          console.error(`[chat] tool "${call.name}" failed`, err);
        }
      }

      toolCalls.push({
        name: call.name,
        args: call.args,
        ok: payload.ok !== false,
      });

      if (call.name === "create_expense" && payload.expense) {
        createdExpenses.push(payload.expense);
      }

      responseParts.push({
        functionResponse: {
          name: call.name,
          ...(call.id ? { id: call.id } : {}),
          response: payload,
        },
      });
    }

    contents.push({ role: "model", parts: modelParts });
    contents.push({ role: "user", parts: responseParts });
  }

  if (!finalText) {
    finalText =
      "I couldn't complete that request. Could you rephrase it or provide a bit more detail?";
  }

  return {
    reply: finalText,
    toolCalls,
    createdExpenses,
    iterations,
  };
};

module.exports = {
  runAgent,
  buildIdempotencyKey,
  SYSTEM_INSTRUCTION,
  MAX_TOOL_ITERATIONS,
};

