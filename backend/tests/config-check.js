const assert = require("assert");
const path = require("path");
const fs = require("fs");

const {
  env,
  hasGeminiCredentials,
  describeConfig,
  assertGeminiCredentials,
  DEFAULT_GEMINI_MODEL,
  ENV_FILE,
} = require("../src/config/env");

const EXAMPLE_FILE = path.join(path.dirname(ENV_FILE), ".env.example");

const run = async () => {
  // 1. `.env` must actually be loaded by the config module.
  const config = describeConfig();
  assert.ok(
    config.envSource === ENV_FILE,
    `Expected .env to be loaded from ${ENV_FILE}, got ${config.envSource}`
  );

  // 2. The resolved model must be the current default and not a retired one.
  assert.strictEqual(
    env.gemini.model,
    DEFAULT_GEMINI_MODEL,
    `Expected default model ${DEFAULT_GEMINI_MODEL}, got ${env.gemini.model}`
  );
  assert.ok(
    !env.gemini.model.startsWith("gemini-2.5-flash"),
    "gemini-2.5-flash is retired for new projects and must not be the default"
  );

  // 3. A local .env must win over an inherited OS-level value.
  assert.strictEqual(
    env.gemini.apiKey,
    process.env.GEMINI_API_KEY,
    "Resolved API key should match the value now present in process.env"
  );
  assert.ok(
    env.gemini.apiKey.length === 0 || !env.gemini.apiKey.startsWith("AIzaSy"),
    "The OS-level Gemini key is invalid; the .env value should have replaced it"
  );

  // 4. Numeric config must be sane.
  assert.ok(
    Number.isInteger(env.port) && env.port > 0 && env.port <= 65535,
    `Expected a valid port, got ${env.port}`
  );
  assert.ok(
    Number.isInteger(env.gemini.timeoutMs) && env.gemini.timeoutMs > 0,
    `Expected a positive timeout, got ${env.gemini.timeoutMs}`
  );

  // 5. Credentials helpers must agree with the resolved config.
  assert.strictEqual(hasGeminiCredentials(), Boolean(env.gemini.apiKey));
  if (hasGeminiCredentials()) {
    assert.doesNotThrow(() => assertGeminiCredentials());
  } else {
    assert.throws(() => assertGeminiCredentials(), /GEMINI_API_KEY/);
  }

  // 6. A committed template must exist for new developers.
  assert.ok(
    fs.existsSync(EXAMPLE_FILE),
    `Expected ${EXAMPLE_FILE} to exist so new devs have a template`
  );
  const example = fs.readFileSync(EXAMPLE_FILE, "utf8");
  assert.ok(example.includes("GEMINI_API_KEY"), ".env.example must document GEMINI_API_KEY");
  assert.ok(example.includes("GEMINI_MODEL"), ".env.example must document GEMINI_MODEL");
  assert.ok(
    !/^GEMINI_API_KEY=.+$/m.test(example),
    ".env.example must not contain a real API key"
  );

  console.log("Config checks passed");
};

run().catch((err) => {
  console.error("Config test failed", err);
  process.exit(1);
});
