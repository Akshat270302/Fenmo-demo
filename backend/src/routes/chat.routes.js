const express = require("express");
const { chat } = require("../controllers/chat.controller");

const router = express.Router();

router.post("/", chat);

module.exports = router;