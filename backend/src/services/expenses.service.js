const { v4: uuidv4 } = require("uuid");
const { db } = require("../db");
const { paiseToRupees } = require("../utils/money");

const getExpenseByIdempotencyKey = (key) => {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT id, amount, category, description, date, created_at, idempotency_key FROM expenses WHERE idempotency_key = ?",
      [key],
      (err, row) => {
        if (err) {
          return reject(err);
        }
        return resolve(row || null);
      }
    );
  });
};

const getExpenseById = (id) => {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT id, amount, category, description, date, created_at, idempotency_key FROM expenses WHERE id = ?",
      [id],
      (err, row) => {
        if (err) {
          return reject(err);
        }
        return resolve(row || null);
      }
    );
  });
};

const insertExpense = (payload) => {
  const statement =
    "INSERT INTO expenses (id, amount, category, description, date, created_at, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?)";

  return new Promise((resolve, reject) => {
    db.run(
      statement,
      [
        payload.id,
        payload.amount,
        payload.category,
        payload.description,
        payload.date,
        payload.created_at,
        payload.idempotency_key,
      ],
      (err) => {
        if (err) {
          return reject(err);
        }
        return resolve();
      }
    );
  });
};

const createExpenseService = async (input) => {
  const existing = await getExpenseByIdempotencyKey(input.idempotency_key);
  if (existing) {
    return { expense: existing, isReplay: true };
  }

  const payload = {
    id: uuidv4(),
    amount: input.amount,
    category: input.category,
    description: input.description,
    date: input.date,
    created_at: new Date().toISOString(),
    idempotency_key: input.idempotency_key,
  };

  try {
    await insertExpense(payload);
    const inserted = await getExpenseById(payload.id);
    return { expense: inserted, isReplay: false };
  } catch (err) {
    if (err && err.code === "SQLITE_CONSTRAINT") {
      const replay = await getExpenseByIdempotencyKey(input.idempotency_key);
      if (replay) {
        return { expense: replay, isReplay: true };
      }
    }
    throw err;
  }
};

const getExpensesService = ({ category }) => {
  const baseQuery =
    "SELECT id, amount, category, description, date, created_at, idempotency_key FROM expenses";
  const params = [];
  let sql = baseQuery;

  if (category) {
    sql += " WHERE category = ?";
    params.push(category);
  }

  sql += " ORDER BY date DESC, created_at DESC";

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        return reject(err);
      }

      const totalPaise = rows.reduce((sum, row) => sum + row.amount, 0);
      const expenses = rows.map((row) => ({
        ...row,
        amount: paiseToRupees(row.amount),
      }));

      return resolve({
        expenses,
        total: paiseToRupees(totalPaise),
      });
    });
  });
};

module.exports = {
  createExpenseService,
  getExpensesService,
};
