const path = require("path");
const fs = require("fs");

/**
 * Centralised environment configuration.
 *
 * `.env` is loaded with `override: true` so a project-local `.env` always wins
 * over a stale value inherited from the OS environment. This matters on
 * Windows, where a machine-level `GEMINI_API_KEY` can otherwise shadow the
 * key shipped in `backend/.env`.
 */

const BACKEND_ROOT = path.join(__dirname, "..", "..");
const ENV_FILE = path.join(BACKEND_ROOT, ".env");

const loadDotenv = () => {
  try {
    // eslint-disable-next-line global-require
    const dotenv = require("dotenv");
    return dotenv.config({
      path: ENV_FILE,
      override: true,
      quiet: true,
    });
  } catch (err) {
    console.warn(
      `[config] Unable to load dotenv (${err.message}). Falling back to process environment.`
    );
    return { error: err };
  }
};

const dotenvResult = loadDotenv();

const readString = (key, fallback = "") => {
  const raw = process.env[key];
  if (raw === undefined || raw === null) {
    return fallback;
  }

  const value = String(raw).trim();
  return value === "" ? fallback : value;
};

const readPositiveInt = (key, fallback) => {
  const raw = readString(key);
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.warn(
      `[config] Ignoring invalid ${key}="${raw}". Expected a positive integer.`
    );
    return fallback;
  }

  return parsed;
};

const readPort = (key, fallback) => {
  const raw = readString(key);
  if (!raw) {
    return fallback;
  }

  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.warn(
      `[config] Ignoring invalid ${key}="${raw}". Expected an integer between 1 and 65535.`
    );
    return fallback;
  }

  return port;
};

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const env = {
  nodeEnv: readString("NODE_ENV", "development"),
  port: readPort("PORT", 3000),
  gemini: {
    apiKey: readString("GEMINI_API_KEY"),
    model: readString("GEMINI_MODEL", DEFAULT_GEMINI_MODEL),
    baseUrl: readString("GEMINI_API_BASE_URL", GEMINI_API_BASE_URL),
    timeoutMs: readPositiveInt("GEMINI_TIMEOUT_MS", 30000),
  },
};

/**
 * True when the Gemini credentials are usable. The API key is intentionally
 * never logged, only its presence and the resolved model are reported.
 */
const hasGeminiCredentials = () => Boolean(env.gemini.apiKey);

const describeConfig = () => {
  const source = dotenvResult && dotenvResult.parsed ? ENV_FILE : "process environment";

  return {
    nodeEnv: env.nodeEnv,
    port: env.port,
    geminiModel: env.gemini.model,
    geminiConfigured: hasGeminiCredentials(),
    envSource: source,
  };
};

const assertGeminiCredentials = () => {
  if (hasGeminiCredentials()) {
    return;
  }

  const examplePath = path.join(BACKEND_ROOT, ".env.example");
  const hint = fs.existsSync(examplePath)
    ? `Copy ${examplePath} to ${ENV_FILE} and set GEMINI_API_KEY.`
    : `Set GEMINI_API_KEY in ${ENV_FILE} or the process environment.`;

  throw new Error(`Missing GEMINI_API_KEY. ${hint}`);
};

module.exports = {
  env,
  hasGeminiCredentials,
  describeConfig,
  assertGeminiCredentials,
  BACKEND_ROOT,
  ENV_FILE,
  DEFAULT_GEMINI_MODEL,
};
