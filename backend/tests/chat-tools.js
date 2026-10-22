const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// The chat tool layer is exercised against an isolated database so the real
// expense data is never read or written by the tests.
//
// The db module resolves its file path at require time, so the temp file is
// prepared first and FENMO_DB_PATH is pointed at it before anything loads.
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fenmo-chat-test-"));
const TEMP_DB_PATH = path.join(TEMP_DIR, "expenses.db");

process.env.FENMO_DB_PATH = TEMP_DB_PATH;

const { db, initDB } = require("../src/db");
const { executeTool, resolvePeriod } = require("../src/services/chat.tools");
const { buildIdempotencyKey } = require("../src/services/chat.agent");

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

  // --- 1. Period arithmetic is resolved on the server -------------------
  const thisMonth = resolvePeriod("thisMonth", "2026-05-15");
  assert.strictEqual(thisMonth.startDate, "2026-05-01");
  assert.strictEqual(thisMonth.endDate, "2026-05-31");

  const lastMonth = resolvePeriod("lastMonth", "2026-05-15");
  assert.strictEqual(lastMonth.startDate, "2026-04-01");
  assert.strictEqual(lastMonth.endDate, "2026-04-30");

  const yesterday = resolvePeriod("yesterday", "2026-05-15");
  assert.strictEqual(yesterday.startDate, "2026-05-14");
  assert.strictEqual(yesterday.endDate, "2026-05-14");

  const last7 = resolvePeriod("last7Days", "2026-05-15");
  assert.strictEqual(last7.startDate, "2026-05-09");
  assert.strictEqual(last7.endDate, "2026-05-15");

  assert.strictEqual(resolvePeriod("nonsense"), null);

  // --- 2. Seed data through the real service layer ----------------------
  const seed = [
    { amount: 250, category: "Food & Dining", description: "lunch", date: "2026-05-10" },
    { amount: 500, category: "Food & Dining", description: "dinner", date: "2026-05-12" },
    { amount: 1000, category: "Travel", description: "train", date: "2026-04-20" },
  ];

  for (let i = 0; i < seed.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await executeTool("create_expense", seed[i], {
      idempotencyKey: `seed-${i}`,
    });
  }

  // --- 3. query_expenses returns accurate totals ------------------------
  const mayQuery = await executeTool(
    "query_expenses",
    { period: "thisMonth" },
    { idempotencyKey: "q1", referenceDate: "2026-05-15" }
  );
  assert.strictEqual(mayQuery.total, "750.00");
  assert.strictEqual(mayQuery.count, 2);
  assert.strictEqual(mayQuery.byCategory.length, 1);
  assert.strictEqual(mayQuery.byCategory[0].category, "Food & Dining");
  assert.strictEqual(mayQuery.byCategory[0].total, "750.00");

  const aprilQuery = await executeTool(
    "query_expenses",
    { period: "lastMonth" },
    { idempotencyKey: "q2", referenceDate: "2026-05-15" }
  );
  assert.strictEqual(aprilQuery.total, "1000.00");
  assert.strictEqual(aprilQuery.count, 1);

  // Category aliasing ("food" -> "Food & Dining")
  const foodQuery = await executeTool(
    "query_expenses",
    { period: "thisMonth", category: "food" },
    { idempotencyKey: "q3", referenceDate: "2026-05-15" }
  );
  assert.strictEqual(foodQuery.total, "750.00");
  assert.strictEqual(foodQuery.appliedFilter.category, "Food & Dining");

  // --- 4. Idempotency on create ----------------------------------------
  const key = buildIdempotencyKey(
    "session-1",
    "turn-1",
    "create_expense",
    { amount: 99.99, category: "Travel", date: "2026-05-14" }
  );
  const first = await executeTool(
    "create_expense",
    { amount: 99.99, category: "Travel", date: "2026-05-14" },
    { idempotencyKey: key }
  );
  const replay = await executeTool(
    "create_expense",
    { amount: 99.99, category: "Travel", date: "2026-05-14" },
    { idempotencyKey: key }
  );
  assert.strictEqual(first.created, true);
  assert.strictEqual(replay.created, false);
  assert.strictEqual(replay.replayed, true);
  assert.strictEqual(first.expense.id, replay.expense.id);

  // The same turn with the same arguments must hash to the same key, even
  // when the argument object is built with a different key order.
  const reordered = buildIdempotencyKey(
    "session-1",
    "turn-1",
    "create_expense",
    { date: "2026-05-14", category: "Travel", amount: 99.99 }
  );
  assert.strictEqual(reordered, key);

  // A different turn in the same session must produce a different key.
  const otherTurn = buildIdempotencyKey(
    "session-1",
    "turn-2",
    "create_expense",
    { amount: 99.99, category: "Travel", date: "2026-05-14" }
  );
  assert.notStrictEqual(otherTurn, key);

  // Two identical calls in the same turn are distinguished by the occurrence
  // index, so they do not collapse into a single expense.
  const firstOccurrence = buildIdempotencyKey(
    "session-1",
    "turn-3",
    "create_expense",
    { amount: 10, category: "Travel" },
    0
  );
  const secondOccurrence = buildIdempotencyKey(
    "session-1",
    "turn-3",
    "create_expense",
    { amount: 10, category: "Travel" },
    1
  );
  assert.notStrictEqual(firstOccurrence, secondOccurrence);

  const travelTotal = await executeTool(
    "query_expenses",
    { period: "thisMonth", category: "Travel" },
    { idempotencyKey: "q4", referenceDate: "2026-05-15" }
  );
  assert.strictEqual(travelTotal.total, "99.99");
  assert.strictEqual(travelTotal.count, 1);

  // --- 5. Invalid tool arguments are rejected ---------------------------
  await assert.rejects(
    () =>
      executeTool(
        "create_expense",
        { category: "Food & Dining" },
        { idempotencyKey: "bad-1" }
      ),
    /amount is required/
  );

  await assert.rejects(
    () =>
      executeTool(
        "create_expense",
        { amount: 100 },
        { idempotencyKey: "bad-2" }
      ),
    /category is required/
  );

  await assert.rejects(
    () =>
      executeTool(
        "create_expense",
        { amount: -5, category: "Food & Dining" },
        { idempotencyKey: "bad-3" }
      ),
    /greater than zero/
  );

  await assert.rejects(
    () =>
      executeTool(
        "create_expense",
        { amount: 100, category: "Food & Dining", date: "not-a-date" },
        { idempotencyKey: "bad-4" }
      ),
    /ISO date/
  );

  await assert.rejects(
    () =>
      executeTool(
        "query_expenses",
        { period: "whenever" },
        { idempotencyKey: "bad-5" }
      ),
    /Unknown period/
  );

  await assert.rejects(
    () =>
      executeTool(
        "query_expenses",
        { startDate: "2026-05-10", endDate: "2026-05-01" },
        { idempotencyKey: "bad-6" }
      ),
    /must not be after/
  );

  // Unknown tool name
  await assert.rejects(
    () => executeTool("drop_table", {}, { idempotencyKey: "bad-7" }),
    /Unknown tool/
  );

  // --- 6. Totals never change from rejected writes ----------------------
  const finalMay = await executeTool(
    "query_expenses",
    { period: "thisMonth" },
    { idempotencyKey: "q5", referenceDate: "2026-05-15" }
  );
  assert.strictEqual(finalMay.total, "849.99");
  assert.strictEqual(finalMay.count, 3);

  console.log("Chat tool tests passed");
};

run()
  .then(() => {
    cleanup();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Chat tool tests failed", err);
    cleanup();
    process.exit(1);
  });
