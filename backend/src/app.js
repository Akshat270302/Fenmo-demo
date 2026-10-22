const express = require("express");
const cors = require("cors");
const expensesRoutes = require("./routes/expenses.routes");
const chatRoutes = require("./routes/chat.routes");
const { successResponse } = require("./utils/errors");

const app = express();

app.use(express.json());
app.use(cors());

app.get("/health", (req, res) => {
  return res.status(200).json(successResponse({ status: "ok" }));
});

app.use("/expenses", expensesRoutes);
app.use("/chat", chatRoutes);

module.exports = app;
