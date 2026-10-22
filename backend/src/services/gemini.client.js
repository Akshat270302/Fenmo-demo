const { env } = require("../config/env");

/**
 * Splits a configured base URL into the `{ baseUrl, apiVersion }` pair the
 * Google GenAI SDK expects.
 *
 * The SDK builds request URLs as `${baseUrl}/${apiVersion}/...`, so a base URL
 * that already ends in `/v1beta` would otherwise produce `/v1beta/v1beta/...`
 * and every request would fail with a 404.
 */
const splitBaseUrl = (raw) => {
  const trimmed = String(raw || "").trim().replace(/\/+$/, "");

  if (!trimmed) {
    return { baseUrl: "https://generativelanguage.googleapis.com", apiVersion: undefined };
  }

  const match = trimmed.match(/^(.*)\/(v\d+[a-z]*)$/i);
  if (match) {
    return { baseUrl: match[1], apiVersion: match[2] };
  }

  return { baseUrl: trimmed, apiVersion: undefined };
};

let cachedClient = null;

/**
 * Lazily creates the shared `GoogleGenAI` client.
 *
 * The API key is only ever read from server-side configuration; it is never
 * logged and never leaves the backend.
 */
const getClient = async () => {
  if (cachedClient) {
    return cachedClient;
  }

  // eslint-disable-next-line global-require
  const { GoogleGenAI } = require("@google/genai");

  const { baseUrl, apiVersion } = splitBaseUrl(env.gemini.baseUrl);

  cachedClient = new GoogleGenAI({
    apiKey: env.gemini.apiKey,
    httpOptions: {
      baseUrl,
      apiVersion,
      timeout: env.gemini.timeoutMs,
    },
  });

  return cachedClient;
};

const resetClient = () => {
  cachedClient = null;
};

/**
 * Transient Gemini failures (deadline exceeded, rate limits, 5xx) are common
 * enough that a single failed request should not abort an entire chat turn.
 * The SDK does not retry these itself, so we do it here with a short backoff.
 */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

const isRetryableError = (err) => {
  if (!err) {
    return false;
  }

  const status = err.status ?? err.code ?? err.response?.status;

  if (typeof status === "number" && RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }

  const message = String(err.message || "").toLowerCase();

  return (
    message.includes("deadline exceeded") ||
    message.includes("deadline_exceeded") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted") ||
    message.includes("unavailable") ||
    message.includes("internal error") ||
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("socket hang up")
  );
};

const delay = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Calls `client.models.generateContent` with a bounded retry policy.
 *
 * @param {object} client The `GoogleGenAI` client instance.
 * @param {object} params Request parameters for `generateContent`.
 * @param {object} [options]
 * @param {number} [options.retries] Number of extra attempts after the first.
 * @param {number} [options.baseDelayMs] Initial backoff delay.
 */
const generateContent = async (client, params, options = {}) => {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 500;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await client.models.generateContent(params);
    } catch (err) {
      lastError = err;

      if (attempt === retries || !isRetryableError(err)) {
        throw err;
      }

      const delayMs = baseDelayMs * 2 ** attempt;
      console.warn(
        `[gemini] transient failure (attempt ${attempt + 1}/${retries + 1}): ${
          err.message || err
        }. Retrying in ${delayMs}ms.`
      );
      // eslint-disable-next-line no-await-in-loop
      await delay(delayMs);
    }
  }

  throw lastError;
};

module.exports = {
  getClient,
  resetClient,
  splitBaseUrl,
  generateContent,
  isRetryableError,
};
