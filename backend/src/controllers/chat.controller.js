const { createHash } = require("crypto");
const { runAgent } = require("../services/chat.agent");
const { errorResponse, successResponse } = require("../utils/errors");

const MAX_MESSAGE_LENGTH = 2000;

const chat = async (req, res) => {
  const body = req.body || {};
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return res
      .status(400)
      .json(errorResponse("Message is required", "VALIDATION_ERROR"));
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return res
      .status(400)
      .json(errorResponse("Message is too long", "VALIDATION_ERROR"));
  }

  const history = Array.isArray(body.history) ? body.history : [];

  // The session id scopes idempotency keys for tool calls. It is derived from
  // trusted server-side request metadata, never from model output.
  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.trim()
      ? body.sessionId.trim()
      : req.get("X-Chat-Session-Id") || "default-session";

  // The turn id identifies a single user message. The client sends a stable
  // id per message so that a retried request replays the same tool calls
  // instead of creating duplicate expenses.
  const turnId =
    typeof body.turnId === "string" && body.turnId.trim()
      ? body.turnId.trim().slice(0, 128)
      : createHash("sha256")
          .update(`${sessionId}|${message}`)
          .digest("hex")
          .slice(0, 32);

  try {
    const result = await runAgent({ message, history, sessionId, turnId });

    return res.status(200).json(
      successResponse({
        reply: result.reply,
        toolCalls: result.toolCalls.map((call) => ({
          name: call.name,
          ok: call.ok,
        })),
        createdExpenses: result.createdExpenses,
        sessionId,
      })
    );
  } catch (err) {
    console.error("Failed to handle chat message", err);

    if (err && err.code === "GEMINI_NOT_CONFIGURED") {
      return res
        .status(503)
        .json(
          errorResponse(
            "Chat is unavailable because the Gemini API key is not configured.",
            "SERVICE_UNAVAILABLE"
          )
        );
    }

    return res
      .status(500)
      .json(errorResponse("Internal server error", "SERVER_ERROR"));
  }
};

module.exports = {
  chat,
};