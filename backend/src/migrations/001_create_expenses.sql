PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  idempotency_key TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses (category);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date);
