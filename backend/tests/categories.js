const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// The category rules are exercised against an isolated database so the real
// expense data is never read or written by the tests.
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fenmo-category-test-"));
const TEMP_DB_PATH = path.join(TEMP_DIR, "expenses.db");

process.env.FENMO_DB_PATH = TEMP_DB_PATH;

const { db, initDB } = require("../src/db");
const { executeTool } = require("../src/services/chat.tools");
const {
  EXPENSE_CATEGORIES,
  resolveCanonicalCategory,
  resolveCategoryAlias,
} = require("../src/config/categories");

const EXPECTED_CATEGORIES = [
  "Food & Dining",
  "Travel",
  "Bills",
  "Health",
  "Entertainment",
  "Other",
];

const cleanup = () => {
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

const run = async () => {
  await initDB();

  // --- 1. The canonical list is exactly the six supported categories ----
  assert.deepStrictEqual(EXPENSE_CATEGORIES, EXPECTED_CATEGORIES);

  // --- 2. Every canonical category is accepted -----------------------
  for (let i = 0; i < EXPENSE_CATEGORIES.length; i += 1) {
    const category = EXPENSE_CATEGORIES[i];
    // eslint-disable-next-line no-await-in-loop
    const created = await executeTool(
      "create_expense",
      { amount: 100 + i, category },
      { idempotencyKey: `ok-${i}` }
    );
    assert.strictEqual(created.expense.category, category);
    assert.strictEqual(created.created, true);
  }

  // --- 3. Unsupported categories are rejected -------------------------
  // These are neither a canonical category nor a known synonym, so the chat
  // tool must refuse to record them.
  const rejected = ["Friends", "clothes", "Education", "Salary", "Shopping"];
  for (let i = 0; i < rejected.length; i += 1) {
    const category = rejected[i];
    // eslint-disable-next-line no-await-in-loop
    await assert.rejects(
      () =>
        executeTool(
          "create_expense",
          { amount: 50, category },
          { idempotencyKey: `bad-cat-${i}` }
        ),
      /not a supported category/
    );
  }

  // An empty category is still reported as missing.
  await assert.rejects(
    () =>
      executeTool(
        "create_expense",
        { amount: 50, category: "" },
        { idempotencyKey: "bad-cat-empty" }
      ),
    /category is required/
  );

  // A rejected write must not create a record.
  const afterReject = await executeTool(
    "query_expenses",
    { period: "allTime" },
    { idempotencyKey: "q-after-reject", referenceDate: "2026-05-15" }
  );
  assert.strictEqual(afterReject.count, EXPECTED_CATEGORIES.length);

  // --- 4. "Other" is a real category, not a custom free-text one ------
  const other = await executeTool(
    "create_expense",
    { amount: 42, category: "Other" },
    { idempotencyKey: "ok-other" }
  );
  assert.strictEqual(other.expense.category, "Other");

  // --- 5. Casing is normalised onto the canonical value ---------------
  const lowerCase = await executeTool(
    "create_expense",
    { amount: 10, category: "  food & dining  " },
    { idempotencyKey: "ok-lower" }
  );
  assert.strictEqual(lowerCase.expense.category, "Food & Dining");

  // --- 6. Known synonyms map onto a canonical category -----------------
  // A synonym is recorded under its canonical name, so the same spending can
  // never be split across two different categories.
  const synonym = await executeTool(
    "create_expense",
    { amount: 15, category: "groceries" },
    { idempotencyKey: "ok-synonym" }
  );
  assert.strictEqual(synonym.expense.category, "Food & Dining");

  assert.strictEqual(resolveCanonicalCategory("Travel"), "Travel");
  assert.strictEqual(resolveCanonicalCategory("travel"), "Travel");
  assert.strictEqual(resolveCanonicalCategory("  Other  "), "Other");
  assert.strictEqual(resolveCanonicalCategory("Friends"), null);
  assert.strictEqual(resolveCanonicalCategory(""), null);
  assert.strictEqual(resolveCanonicalCategory(undefined), null);
  assert.strictEqual(resolveCanonicalCategory(123), null);

  assert.strictEqual(resolveCategoryAlias("food"), "Food & Dining");
  assert.strictEqual(resolveCategoryAlias("groceries"), "Food & Dining");
  assert.strictEqual(resolveCategoryAlias("transport"), "Travel");
  assert.strictEqual(resolveCategoryAlias("clothes"), null);

  // --- 7. The chatbot is only offered the canonical categories -------
  const query = await executeTool(
    "query_expenses",
    { period: "allTime" },
    { idempotencyKey: "q-canonical", referenceDate: "2026-05-15" }
  );
  assert.deepStrictEqual(query.availableCategories, EXPECTED_CATEGORIES);

  // --- 8. A synonym filter resolves to the canonical category ---------
  const foodQuery = await executeTool(
    "query_expenses",
    { period: "allTime", category: "food" },
    { idempotencyKey: "q-food", referenceDate: "2026-05-15" }
  );
  assert.strictEqual(foodQuery.appliedFilter.category, "Food & Dining");
  // The seeded "Food & Dining" record, the lower-cased one and the synonym.
  assert.strictEqual(foodQuery.count, 3);

  console.log("Category tests passed");
};

run()
  .then(() => {
    cleanup();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Category tests failed", err);
    cleanup();
    process.exit(1);
  });