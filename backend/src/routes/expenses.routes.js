const express = require("express");
const { createExpense } = require("../controllers/expenses.controller");

const router = express.Router();

router.post("/", createExpense);

module.exports = router;
