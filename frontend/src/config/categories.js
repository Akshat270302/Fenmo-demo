/**
 * The canonical expense categories.
 *
 * These must stay in sync with `backend/src/config/categories.js`, which is the
 * source of truth the API validates against. The backend rejects any category
 * that is not in this list.
 */
export const EXPENSE_CATEGORIES = [
  "Food & Dining",
  "Travel",
  "Bills",
  "Health",
  "Entertainment",
  "Other",
];

export default EXPENSE_CATEGORIES;
