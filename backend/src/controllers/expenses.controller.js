const { successResponse } = require("../utils/errors");

const createExpense = (req, res) => {
  return res.status(200).json(successResponse({ message: "Not implemented" }));
};

const getExpenses = (req, res) => {
  return res.status(200).json(successResponse({ message: "Not implemented" }));
};

module.exports = {
  createExpense,
  getExpenses,
};
