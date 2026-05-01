const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DB_PATH = path.join(__dirname, "../data/expenses.db");

const request = async (pathName, options) => {
  const response = await fetch(`${BASE_URL}${pathName}`, options);
  const data = await response.json();
  return { status: response.status, data };
};

const assertSuccessEnvelope = (response) => {
  if (response.data?.success !== true || !response.data?.data) {
    throw new Error("Expected success envelope");
  }
};

const assertErrorEnvelope = (response) => {
  if (response.data?.success !== false || response.data?.data !== null) {
    throw new Error("Expected error envelope");
  }
  if (!response.data?.error?.message || !response.data?.error?.code) {
    throw new Error("Missing error details");
  }
};

const openDb = () => new sqlite3.Database(DB_PATH);

const getExpenseByKey = (key) =>
  new Promise((resolve, reject) => {
    const db = openDb();
    db.get(
      "SELECT id, amount, category FROM expenses WHERE idempotency_key = ?",
      [key],
      (err, row) => {
        db.close();
        if (err) return reject(err);
        return resolve(row || null);
      }
    );
  });

const countByKey = (key) =>
  new Promise((resolve, reject) => {
    const db = openDb();
    db.get(
      "SELECT COUNT(1) as count FROM expenses WHERE idempotency_key = ?",
      [key],
      (err, row) => {
        db.close();
        if (err) return reject(err);
        return resolve(row ? row.count : 0);
      }
    );
  });

const run = async () => {
  const baseKey = `test-${Date.now()}`;
  const payload = {
    amount: "100.50",
    category: "Food & Dining",
    description: "Lunch",
    date: "2026-05-01",
  };

  const headers = {
    "Content-Type": "application/json",
    "Idempotency-Key": baseKey,
  };

  const first = await request("/expenses", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (first.status !== 201) {
    throw new Error(`Expected 201, got ${first.status}`);
  }
  assertSuccessEnvelope(first);

  const second = await request("/expenses", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (second.status !== 200) {
    throw new Error(`Expected 200, got ${second.status}`);
  }
  assertSuccessEnvelope(second);

  const diffBody = {
    amount: "500.00",
    category: "Travel",
    description: "Flight",
    date: "2026-05-02",
  };

  const third = await request("/expenses", {
    method: "POST",
    headers,
    body: JSON.stringify(diffBody),
  });
  if (third.status !== 200) {
    throw new Error(`Expected 200, got ${third.status}`);
  }
  assertSuccessEnvelope(third);

  const original = first.data.data.expense;
  const replay = third.data.data.expense;
  if (JSON.stringify(original) !== JSON.stringify(replay)) {
    throw new Error("Idempotency mismatch for same key with different body");
  }

  const stored = await getExpenseByKey(baseKey);
  if (!stored || stored.amount !== 10050) {
    throw new Error("DB amount not stored in paise as expected");
  }

  const raceKey = `race-${Date.now()}`;
  const raceHeaders = {
    "Content-Type": "application/json",
    "Idempotency-Key": raceKey,
  };

  const racePayload = {
    amount: "12.00",
    category: "Food & Dining",
    description: "Race",
    date: "2026-05-01",
  };

  const [raceA, raceB] = await Promise.all([
    request("/expenses", {
      method: "POST",
      headers: raceHeaders,
      body: JSON.stringify(racePayload),
    }),
    request("/expenses", {
      method: "POST",
      headers: raceHeaders,
      body: JSON.stringify(racePayload),
    }),
  ]);

  if (![200, 201].includes(raceA.status) || ![200, 201].includes(raceB.status)) {
    throw new Error("Race condition responses not 200/201");
  }

  const count = await countByKey(raceKey);
  if (count !== 1) {
    throw new Error(`Race condition created ${count} rows`);
  }

  const list = await request("/expenses", { method: "GET" });
  if (list.status !== 200) {
    throw new Error(`Expected 200, got ${list.status}`);
  }
  assertSuccessEnvelope(list);

  console.log("Smoke tests passed");
};

run().catch((err) => {
  console.error("Test script failed", err);
  process.exit(1);
});
