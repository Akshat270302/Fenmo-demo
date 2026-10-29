const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

// The API is exercised against an isolated database so the real expense data
// is never read or written by the tests.
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fenmo-api-category-test-"));
const TEMP_DB_PATH = path.join(TEMP_DIR, "expenses.db");

process.env.FENMO_DB_PATH = TEMP_DB_PATH;

const { db, initDB } = require("../src/db");
const app = require("../src/app");
const { EXPENSE_CATEGORIES } = require("../src/config/categories");

const EXPECTED_CATEGORIES = [
  "Food & Dining",
  "Travel",
  "Bills",
  "Health",
  "Entertainment",
  "Other",
];

let server;
let baseUrl;

const cleanup = () => {
  if (server) {
    server.close();
  }
  try {
    db.close();
  } catch (err) {
    // ignore
  }
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch (err) {
    // ignore
  }
};

const request = (method, routePath, body, headers = {}) =>
  new Promise((resolve, reject) => {
    const url = new URL(`${baseUrl}${routePath}`);
    const payload = body === undefined ? null : JSON.stringify(body);

    const req = http.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch (err) {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });

const run = async () => {
  await initDB();

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });

  // --- 1. Every canonical category is accepted by the API ------------
  for (let i = 0; i < EXPECTED_CATEGORIES.length; i += 1) {
    const category = EXPECTED_CATEGORIES[i];
    // eslint-disable-next-line no-await-in-loop
    const response = await request(
      "POST",
      "/expenses",
      {
        amount: "100.00",
        category,
        description: "canonical",
        date: "2026-05-01",
      },
      { "Idempotency-Key": `api-ok-${i}` }
    );

    assert.strictEqual(response.status, 201, `Expected 201 for ${category}`);
    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.data.expense.category, category);
  }

  // --- 2. Unsupported categories are rejected -------------------------
  const rejected = ["Friends", "clothes", "Education", "Salary"];
  for (let i = 0; i < rejected.length; i += 1) {
    const category = rejected[i];
    // eslint-disable-next-line no-await-in-loop
    const response = await request(
      "POST",
      "/expenses",
      {
        amount: "100.00",
        category,
        description: "unsupported",
        date: "2026-05-01",
      },
      { "Idempotency-Key": `api-bad-${i}` }
    );

    assert.strictEqual(response.status, 400, `Expected 400 for ${category}`);
    assert.strictEqual(response.body.success, false);
    assert.strictEqual(response.body.error.code, "VALIDATION_ERROR");
    assert.match(response.body.error.message, /Unsupported category/);
  }

  // --- 3. "Other" is accepted like any other category -----------------
  const other = await request(
    "POST",
    "/expenses",
    {
      amount: "25.00",
      category: "Other",
      description: "misc",
      date: "2026-05-01",
    },
    { "Idempotency-Key": "api-other" }
  );
  assert.strictEqual(other.status, 201);
  assert.strictEqual(other.body.data.expense.category, "Other");

  // --- 4. A missing category is still reported as missing -------------
  const missing = await request(
    "POST",
    "/expenses",
    { amount: "25.00", date: "2026-05-01" },
    { "Idempotency-Key": "api-missing" }
  );
  assert.strictEqual(missing.status, 400);
  assert.match(missing.body.error.message, /Category is required/);

  // --- 5. Only the canonical categories were written ------------------
  const list = await request("GET", "/expenses");
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.body.data.expenses.length, EXPECTED_CATEGORIES.length + 1);

  const storedCategories = new Set(
    list.body.data.expenses.map((expense) => expense.category)
  );
  storedCategories.forEach((category) => {
    assert.ok(
      EXPENSE_CATEGORIES.includes(category),
      `Unexpected category stored: ${category}`
    );
  });

  console.log("API category tests passed");
};

run()
  .then(() => {
    cleanup();
    process.exit(0);
  })
  .catch((err) => {
    console.error("API category tests failed", err);
    cleanup();
    process.exit(1);
  });