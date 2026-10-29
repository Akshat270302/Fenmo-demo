/**
 * The canonical expense categories.
 *
 * This list is the single source of truth for the chatbot, the REST API and
 * the expense form. Stored rows are never rewritten to match it, so a record
 * saved before this list existed keeps its original category value.
 */
const EXPENSE_CATEGORIES = [
  "Food & Dining",
  "Travel",
  "Bills",
  "Health",
  "Entertainment",
  "Other",
];

const CATEGORY_LOOKUP = new Map(
  EXPENSE_CATEGORIES.map((category) => [category.toLowerCase(), category])
);

/**
 * Resolves a free-text category onto a canonical one.
 *
 * Returns `null` when the value is not one of the canonical categories, so
 * callers can reject it instead of silently storing an unknown category.
 */
const resolveCanonicalCategory = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return CATEGORY_LOOKUP.get(trimmed.toLowerCase()) || null;
};

/**
 * Maps common synonyms onto their canonical category.
 *
 * The chatbot uses this so "food" or "groceries" become "Food & Dining"
 * instead of an unsupported category.
 */
const CATEGORY_ALIASES = {
  food: "Food & Dining",
  "food & dining": "Food & Dining",
  "food and dining": "Food & Dining",
  dining: "Food & Dining",
  restaurant: "Food & Dining",
  groceries: "Food & Dining",
  coffee: "Food & Dining",
  travel: "Travel",
  transport: "Travel",
  cab: "Travel",
  taxi: "Travel",
  flight: "Travel",
  fuel: "Travel",
  bills: "Bills",
  bill: "Bills",
  utilities: "Bills",
  electricity: "Bills",
  rent: "Bills",
  health: "Health",
  medical: "Health",
  healthcare: "Health",
  medicine: "Health",
  doctor: "Health",
  entertainment: "Entertainment",
  movie: "Entertainment",
  movies: "Entertainment",
  music: "Entertainment",
  games: "Entertainment",
  other: "Other",
  misc: "Other",
  miscellaneous: "Other",
};

const resolveCategoryAlias = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const alias = CATEGORY_ALIASES[trimmed.toLowerCase()];
  return alias ? resolveCanonicalCategory(alias) : null;
};

module.exports = {
  EXPENSE_CATEGORIES,
  resolveCanonicalCategory,
  resolveCategoryAlias,
};