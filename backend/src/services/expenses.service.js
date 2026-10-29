const { v4: uuidv4 } = require("uuid");
const { db } = require("../db");
const { paiseToRupees } = require("../utils/money");
const {
  EXPENSE_CATEGORIES,
  resolveCanonicalCategory,
  resolveCategoryAlias,
} = require("../config/categories");

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

// ---------------------------------------------------------------------------
// Query helpers used by the chat agent's `query_expenses` tool.
//
// The model never supplies SQL. These helpers own every SQL string; the
// model's arguments are only ever bound as parameter values.
// ---------------------------------------------------------------------------

const getDistinctCategoriesService = () => {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT category, COUNT(1) AS count, SUM(amount) AS total FROM expenses GROUP BY category ORDER BY category",
      [],
      (err, rows) => {
        if (err) {
          return reject(err);
        }

        return resolve(
          rows.map((row) => ({
            category: row.category,
            count: row.count,
            total: paiseToRupees(row.total),
          }))
        );
      }
    );
  });
};

/**
 * Maps a model-supplied category onto a category that can actually be queried.
 *
 * Canonical categories are matched first, then their common synonyms. Stored
 * rows are never rewritten, so legacy categories that predate the canonical
 * list are still matched directly to keep those records queryable.
 *
 * Returns `{ category: null }` when nothing matches so the agent can report
 * the real category list instead of querying with a guessed value.
 */
const resolveCategoryFilter = (requested, availableCategories) => {
  const needle = String(requested || "").trim().toLowerCase();

  if (!needle) {
    return { category: null, matched: false };
  }

  const canonical = resolveCanonicalCategory(needle);
  if (canonical) {
    return { category: canonical, matched: true };
  }

  const alias = resolveCategoryAlias(needle);
  if (alias) {
    return { category: alias, matched: true };
  }

  const stored = availableCategories.find(
    (item) => item.category.toLowerCase() === needle
  );
  if (stored) {
    return { category: stored.category, matched: true };
  }

  const partial = availableCategories.find(
    (item) =>
      item.category.toLowerCase().includes(needle) ||
      needle.includes(item.category.toLowerCase())
  );
  if (partial) {
    return { category: partial.category, matched: true };
  }

  return { category: null, matched: false };
};

const queryExpensesService = async ({ category, startDate, endDate }) => {
  const availableCategories = await getDistinctCategoriesService();
  const resolved = resolveCategoryFilter(category, availableCategories);

  const conditions = [];
  const params = [];

  if (resolved.category) {
    conditions.push("category = ?");
    params.push(resolved.category);
  }

  if (startDate) {
    conditions.push("date(date) >= date(?)");
    params.push(startDate);
  }

  if (endDate) {
    conditions.push("date(date) <= date(?)");
    params.push(endDate);
  }

  const whereClause = conditions.length
    ? ` WHERE ${conditions.join(" AND ")}`
    : "";

  const rows = await new Promise((resolve, reject) => {
    db.all(
      "SELECT id, amount, category, description, date, created_at FROM expenses" +
        whereClause +
        " ORDER BY date DESC, created_at DESC",
      params,
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });

  const totalPaise = rows.reduce((sum, row) => sum + row.amount, 0);

  const categoryTotals = new Map();
  rows.forEach((row) => {
    const current = categoryTotals.get(row.category) || {
      category: row.category,
      count: 0,
      totalPaise: 0,
    };
    current.count += 1;
    current.totalPaise += row.amount;
    categoryTotals.set(row.category, current);
  });

  return {
    expenses: rows.map((row) => ({
      ...row,
      amount: paiseToRupees(row.amount),
    })),
    total: paiseToRupees(totalPaise),
    count: rows.length,
    byCategory: Array.from(categoryTotals.values())
      .map((item) => ({
        category: item.category,
        count: item.count,
        total: paiseToRupees(item.totalPaise),
      }))
      .sort((a, b) => Number(b.total) - Number(a.total)),
    // The chatbot is only ever offered the canonical categories. Legacy rows
    // stay in the database untouched, but the model is not told about them so
    // it cannot create new records with an unsupported category.
    availableCategories: [...EXPENSE_CATEGORIES],
    resolvedCategory: resolved.category,
  };
};

module.exports = {
  createExpenseService,
  getExpensesService,
  getDistinctCategoriesService,
  resolveCategoryFilter,
  queryExpensesService,
};
