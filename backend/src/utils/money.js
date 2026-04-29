const rupeesToPaise = (input) => {
  if (input === null || input === undefined) {
    throw new Error("Amount is required");
  }

  const value = String(input).trim();
  const match = value.match(/^\d+(?:\.\d{1,2})?$/);

  if (!match) {
    throw new Error("Invalid amount format");
  }

  const parts = value.split(".");
  const wholePart = parts[0];
  const fractionalPart = parts[1] || "";

  // Build paise using integer math to avoid float errors.
  const normalizedFraction = (fractionalPart + "00").slice(0, 2);
  const paise = Number(wholePart) * 100 + Number(normalizedFraction);

  if (!Number.isSafeInteger(paise)) {
    throw new Error("Amount is too large");
  }

  if (paise <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  return paise;
};

const paiseToRupees = (paise) => {
  if (!Number.isInteger(paise) || paise < 0) {
    throw new Error("Invalid paise value");
  }

  return (paise / 100).toFixed(2);
};

module.exports = {
  rupeesToPaise,
  paiseToRupees,
};
