const {
  createExpenseService,
  getExpensesService,
} = require("../services/expenses.service");
const { errorResponse, successResponse } = require("../utils/errors");
const { paiseToRupees, rupeesToPaise } = require("../utils/money");

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2}))?$/;

const isValidIsoDate = (value) => {
  if (!ISO_DATE_REGEX.test(value)) {
    return false;
  }

  return !Number.isNaN(Date.parse(value));
};

const createExpense = async (req, res) => {
  const idempotencyKey = req.get("Idempotency-Key");

  if (!idempotencyKey || !idempotencyKey.trim()) {
    return res
      .status(400)
      .json(errorResponse("Idempotency-Key is required", "VALIDATION_ERROR"));
  }

  const amountInput = req.body ? req.body.amount : undefined;
  const categoryInput = req.body ? req.body.category : undefined;
  const descriptionInput = req.body ? req.body.description : undefined;
  const dateInput = req.body ? req.body.date : undefined;

  const category = typeof categoryInput === "string" ? categoryInput.trim() : "";
  if (!category) {
    return res
      .status(400)
      .json(errorResponse("Category is required", "VALIDATION_ERROR"));
  }

  const dateValue = typeof dateInput === "string" ? dateInput.trim() : "";
  if (!dateValue || !isValidIsoDate(dateValue)) {
    return res
      .status(400)
      .json(errorResponse("Date must be a valid ISO string", "VALIDATION_ERROR"));
  }

  const description =
    typeof descriptionInput === "string" ? descriptionInput.trim() : null;

  let amountPaise;
  try {
    amountPaise = rupeesToPaise(amountInput);
  } catch (err) {
    return res
      .status(400)
      .json(errorResponse("Invalid amount", "VALIDATION_ERROR"));
  }

  try {
    const result = await createExpenseService({
      amount: amountPaise,
      category,
      description: description || null,
      date: dateValue,
      idempotency_key: idempotencyKey.trim(),
    });

    const responseExpense = {
      ...result.expense,
      amount: paiseToRupees(result.expense.amount),
    };

    return res
      .status(result.isReplay ? 200 : 201)
      .json(successResponse({ expense: responseExpense }));
  } catch (err) {
    console.error("Failed to create expense", err);
    return res
      .status(500)
      .json(errorResponse("Internal server error", "SERVER_ERROR"));
  }
};

const getExpenses = async (req, res) => {
  const categoryParam =
    typeof req.query.category === "string" ? req.query.category.trim() : "";

  if (req.query.category !== undefined && !categoryParam) {
    return res
      .status(400)
      .json(errorResponse("Category must be non-empty", "VALIDATION_ERROR"));
  }

  try {
    const result = await getExpensesService({
      category: categoryParam || null,
    });

    return res.status(200).json(successResponse(result));
  } catch (err) {
    console.error("Failed to fetch expenses", err);
    return res
      .status(500)
      .json(errorResponse("Internal server error", "SERVER_ERROR"));
  }
};

module.exports = {
  createExpense,
  getExpenses,
};
