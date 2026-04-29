const express = require("express");
const {
  createExpense,
  getExpenses,
} = require("../controllers/expenses.controller");

const router = express.Router();

router.post("/", createExpense);
router.get("/", getExpenses);

module.exports = router;
