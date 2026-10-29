const { Type } = require("@google/genai");
const {
  createExpenseService,
  queryExpensesService,
} = require("../services/expenses.service");
const { paiseToRupees, rupeesToPaise } = require("../utils/money");
const {
  EXPENSE_CATEGORIES,
  resolveCanonicalCategory,
  resolveCategoryAlias,
} = require("../config/categories");

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?)?$/;

const MAX_CATEGORY_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_AMOUNT_RUPEES = 100000000;

class ToolInputError extends Error {
  constructor(message, code = "VALIDATION_ERROR") {
    super(message);
    this.name = "ToolInputError";
    this.code = code;
  }
}

const toIsoDate = (value, fieldName) => {
  if (typeof value !== "string") {
    throw new ToolInputError(
      `${fieldName} must be an ISO date string (YYYY-MM-DD).`
    );
  }

  const trimmed = value.trim();

  if (ISO_DATE_REGEX.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new ToolInputError(`${fieldName} is not a real calendar date.`);
    }
    return trimmed;
  }

  if (ISO_DATETIME_REGEX.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new ToolInputError(`${fieldName} is not a valid ISO timestamp.`);
    }
    return parsed.toISOString().slice(0, 10);
  }

  throw new ToolInputError(
    `${fieldName} must be an ISO date string (YYYY-MM-DD).`
  );
};

const toLocalToday = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

const toDateString = (value) => {
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
};

/**
 * Resolves a named period into concrete inclusive date bounds.
 * Period arithmetic is done on the server so the model cannot mis-compute it.
 */
const resolvePeriod = (period, referenceDate) => {
  const today = referenceDate
    ? toIsoDate(referenceDate, "referenceDate")
    : toLocalToday();
  const base = new Date(`${today}T00:00:00`);

  const monthStart = (year, month) =>
    toDateString(new Date(year, month, 1));
  const monthEnd = (year, month) =>
    toDateString(new Date(year, month + 1, 0));

  switch (period) {
    case "today":
      return { startDate: today, endDate: today };
    case "yesterday": {
      const yesterday = new Date(base);
      yesterday.setDate(yesterday.getDate() - 1);
      const value = toDateString(yesterday);
      return { startDate: value, endDate: value };
    }
    case "last7Days": {
      const start = new Date(base);
      start.setDate(start.getDate() - 6);
      return { startDate: toDateString(start), endDate: today };
    }
    case "last30Days": {
      const start = new Date(base);
      start.setDate(start.getDate() - 29);
      return { startDate: toDateString(start), endDate: today };
    }
    case "thisMonth":
      return {
        startDate: monthStart(base.getFullYear(), base.getMonth()),
        endDate: monthEnd(base.getFullYear(), base.getMonth()),
      };
    case "lastMonth":
      return {
        startDate: monthStart(base.getFullYear(), base.getMonth() - 1),
        endDate: monthEnd(base.getFullYear(), base.getMonth() - 1),
      };
    case "thisYear":
      return {
        startDate: `${base.getFullYear()}-01-01`,
        endDate: `${base.getFullYear()}-12-31`,
      };
    case "allTime":
      return { startDate: null, endDate: null };
    default:
      return null;
  }
};

/**
 * Validates and runs `query_expenses`.
 * All SQL lives in the service layer; only bound values reach the database.
 */
const runQueryExpenses = async (rawArgs, context) => {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  // The reference date comes from trusted server-side context only. The model
  // can never influence which calendar window a period resolves to.
  const referenceDate = context && context.referenceDate;

  const category =
    args.category === undefined || args.category === null
      ? null
      : String(args.category).trim();

  if (category !== null && !category) {
    throw new ToolInputError(
      "category must be a non-empty string when provided."
    );
  }

  if (category && category.length > MAX_CATEGORY_LENGTH) {
    throw new ToolInputError("category is too long.");
  }

  const period =
    args.period === undefined || args.period === null
      ? null
      : String(args.period).trim();

  let startDate = null;
  let endDate = null;

  if (period) {
    const resolved = resolvePeriod(period, referenceDate);
    if (!resolved) {
      throw new ToolInputError(
        `Unknown period "${period}". Use one of: today, yesterday, last7Days, last30Days, thisMonth, lastMonth, thisYear, allTime.`
      );
    }
    startDate = resolved.startDate;
    endDate = resolved.endDate;
  }

  if (
    args.startDate !== undefined &&
    args.startDate !== null &&
    args.startDate !== ""
  ) {
    startDate = toIsoDate(args.startDate, "startDate");
  }

  if (
    args.endDate !== undefined &&
    args.endDate !== null &&
    args.endDate !== ""
  ) {
    endDate = toIsoDate(args.endDate, "endDate");
  }

  if (startDate && endDate && startDate > endDate) {
    throw new ToolInputError("startDate must not be after endDate.");
  }

  const result = await queryExpensesService({
    category: category || null,
    startDate,
    endDate,
  });

  return {
    total: result.total,
    count: result.count,
    currency: "INR",
    byCategory: result.byCategory,
    expenses: result.expenses,
    availableCategories: result.availableCategories,
    appliedFilter: {
      category: result.resolvedCategory,
      startDate,
      endDate,
    },
  };
};

const toolDeclarations = [
  {
    name: "query_expenses",
    description:
      "Read stored expense records and return exact totals, per-category subtotals, and the matching transactions. Use this for any question about how much was spent, on what, when, or how two periods compare. Provide either a named `period` or explicit `startDate`/`endDate` (inclusive, YYYY-MM-DD).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        period: {
          type: Type.STRING,
          description:
            "Named range: today, yesterday, last7Days, last30Days, thisMonth, lastMonth, thisYear, allTime.",
          enum: [
            "today",
            "yesterday",
            "last7Days",
            "last30Days",
            "thisMonth",
            "lastMonth",
            "thisYear",
            "allTime",
          ],
        },
        startDate: {
          type: Type.STRING,
          description: "Inclusive start date, YYYY-MM-DD. Use with endDate.",
        },
        endDate: {
          type: Type.STRING,
          description: "Inclusive end date, YYYY-MM-DD. Use with startDate.",
        },
        category: {
          type: Type.STRING,
          description:
            "Optional category filter. Must be one of the supported categories; synonyms like 'food' are resolved to 'Food & Dining'.",
          enum: [...EXPENSE_CATEGORIES],
        },
      },
      required: [],
    },
  },
  {
    name: "create_expense",
    description:
      "Record a new expense transaction. Only call this when the user has given a concrete amount and category. The date defaults to today when the user does not mention one.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        amount: {
          type: Type.NUMBER,
          description: "Amount in rupees, e.g. 250 for ₹250.",
        },
        category: {
          type: Type.STRING,
          description:
            "Category of the expense. Must be one of the supported categories.",
          enum: [...EXPENSE_CATEGORIES],
        },
        description: {
          type: Type.STRING,
          description: "Short free-text note, e.g. 'lunch'.",
        },
        date: {
          type: Type.STRING,
          description:
            "Transaction date as YYYY-MM-DD. Defaults to today when omitted.",
        },
      },
      required: ["amount", "category"],
    },
  },
];


/**
 * Validates and runs `create_expense` through the existing validated service.
 *
 * `idempotencyKey` is derived server-side from the conversation and the tool
 * call id, so a retried tool call can never create a duplicate row.
 */
const runCreateExpense = async (rawArgs, context) => {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};

  if (
    args.amount === undefined ||
    args.amount === null ||
    args.amount === ""
  ) {
    throw new ToolInputError(
      "amount is required. Ask the user how much they spent before recording it.",
      "MISSING_AMOUNT"
    );
  }

  const amountNumber = Number(args.amount);
  if (!Number.isFinite(amountNumber)) {
    throw new ToolInputError("amount must be a number.");
  }
  if (amountNumber <= 0) {
    throw new ToolInputError("amount must be greater than zero.");
  }
  if (amountNumber > MAX_AMOUNT_RUPEES) {
    throw new ToolInputError("amount is unrealistically large.");
  }

  const category = String(
    args.category === undefined ? "" : args.category
  ).trim();
  if (!category) {
    throw new ToolInputError(
      "category is required. Ask the user which category this expense belongs to.",
      "MISSING_CATEGORY"
    );
  }
  if (category.length > MAX_CATEGORY_LENGTH) {
    throw new ToolInputError("category is too long.");
  }

  // The model may only ever create a record with one of the canonical
  // categories. A well-known synonym is mapped onto its canonical category so
  // the stored value stays consistent with the rest of the app.
  const canonicalCategory =
    resolveCanonicalCategory(category) || resolveCategoryAlias(category);
  if (!canonicalCategory) {
    throw new ToolInputError(
      `"${category}" is not a supported category. Use one of: ${EXPENSE_CATEGORIES.join(
        ", "
      )}.`,
      "UNSUPPORTED_CATEGORY"
    );
  }

  const description =
    args.description === undefined || args.description === null
      ? null
      : String(args.description).trim();
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ToolInputError("description is too long.");
  }

  const date =
    args.date === undefined ||
    args.date === null ||
    String(args.date).trim() === ""
      ? toLocalToday()
      : toIsoDate(args.date, "date");

  let amountPaise;
  try {
    amountPaise = rupeesToPaise(amountNumber.toFixed(2));
  } catch (err) {
    throw new ToolInputError("amount is not a valid positive amount.");
  }

  const result = await createExpenseService({
    amount: amountPaise,
    category: canonicalCategory,
    description: description || null,
    date,
    idempotency_key: context.idempotencyKey,
  });

  return {
    created: !result.isReplay,
    replayed: result.isReplay,
    expense: {
      id: result.expense.id,
      amount: paiseToRupees(result.expense.amount),
      category: result.expense.category,
      description: result.expense.description,
      date: result.expense.date,
      createdAt: result.expense.created_at,
    },
  };
};

const executeTool = async (name, args, context) => {
  switch (name) {
    case "query_expenses":
      return runQueryExpenses(args, context);
    case "create_expense":
      return runCreateExpense(args, context);
    default:
      throw new ToolInputError(`Unknown tool "${name}".`);
  }
};

module.exports = {
  toolDeclarations,
  executeTool,
  resolvePeriod,
  toIsoDate,
  toLocalToday,
  ToolInputError,
};
