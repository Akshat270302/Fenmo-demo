# SmartSpend Expense Tracker

**SmartSpend** is a full-stack personal expense tracker built around a conversational
AI assistant. It pairs a REST API with a React dashboard so that expenses can
be recorded either through a traditional form or simply by asking the assistant
in plain language: *"Add ₹250 for dinner under Food & Dining"*.

The project is built on Node.js and Express with a SQLite datastore, and uses
Google's Gemini model for natural-language understanding and tool calling. All
monetary values are stored as integer **paise**, so no floating-point drift can
corrupt a total.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [API Reference](#api-reference)
- [Expense Categories](#expense-categories)
- [Chat Tools](#chat-tools)
- [Database](#database)
- [Testing](#testing)
- [Design Decisions](#design-decisions)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

### Core

- **Create expenses** with amount, category, description and date.
- **Idempotent writes**: every create requires an `Idempotency-Key` header, so a
  retried request replays the original record instead of creating a duplicate.
- **Filterable queries**: list all expenses or filter by a single category.
- **Aggregated totals**: list responses include an exact total, and chat queries
  additionally return a count and per-category subtotals.
- **Uniform API envelope**: all responses use `{ success, data, error }`, with
  structured error codes.

### Conversational AI assistant

- **Natural-language expense entry**: describe a transaction and the assistant
  records it via Gemini function calling.
- **Natural-language querying**: *"How much did I spend this month?"* or
  *"Compare this month with last month"* are answered from real records.
- **Server-side period arithmetic**: named periods (`today`, `last7Days`,
  `thisMonth`, …) are resolved into concrete date bounds on the server, so the
  model can never mis-compute a date range.
- **Turn-level idempotency**: each chat turn carries a stable `turnId`; a
  failed request can be retried with the *same* id and the backend replays the
  original tool calls rather than creating a second expense.
- **Conversation memory**: prior turns are maintained client-side and sent
  back with each request, giving the assistant conversational context.
- **Suggestion chips**: one-click prompts for common questions.

### Dashboard

- Dashboard and Transactions views.
- Add-expense form with inline validation.
- Category filter and free-text search across category and description.
- Date-range filtering (all time, today, this week, this month, last month).
- Per-category breakdown with totals.
- Live refresh whenever the assistant records a new expense.
- Assistant panel with error display and a **Retry** button.

### Data integrity

- **One canonical category list** shared by the chatbot, the REST API and the
  expense form.
- Unsupported categories are **rejected**, not silently stored.
- Amounts are validated, converted to paise with integer math, and range-checked.
- Legacy rows are never rewritten: historical data stays intact and queryable.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 18+ |
| Backend framework | Express 4 |
| Database | SQLite via `sqlite3` 5 |
| AI model | Google Gemini via `@google/genai` |
| Frontend | React 18 + Vite 5 |
| Frontend tests | Vitest 2 + Testing Library + jsdom |
| Backend tests | Node `assert` (no framework required) |
| Validation | Hand-written, dependency-free |
| IDs | `uuid` v4 |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                           Browser                            │
│  ExpenseForm   ExpenseTable   Chatbot   AnalyticsView*       │
│       └────────────┴────────────┴───────────┘                │
│                api/expenses.js · api/chat.js                 │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP (JSON)
┌───────────────────────────▼──────────────────────────────────┐
│                         Express API                          │
│   routes/  →  controllers/  →  services/  →  db/             │
│                                                              │
│   /expenses      /chat      chat.agent.js                    │
│                             → Gemini function calling        │
│                             chat.tools.js                    │
│                             → validated tool handlers        │
│                                                              │
│   config/categories.js · config/env.js · utils/money.js      │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                SQLite (backend/data/expenses.db)             │
└──────────────────────────────────────────────────────────────┘

* AnalyticsView is built but not yet wired into the app shell.
```

**Layering rules**

- `routes/` only maps URLs to controller functions.
- `controllers/` own HTTP concerns: validation, status codes, response envelopes.
- `services/` own business logic and are the only layer that touches SQL.
- `config/` holds the canonical category list and environment resolution.

---

## Project Structure

```
SmartSpend/
├── README.md                       ← you are here
├── .gitignore
│
├── backend/
│   ├── .env.example                ← template for local configuration
│   ├── package.json
│   ├── data/
│   │   └── expenses.db             ← SQLite database (auto-created)
│   ├── src/
│   │   ├── app.js                  ← Express app assembly
│   │   ├── server.js               ← bootstrap, graceful shutdown
│   │   ├── config/
│   │   │   ├── categories.js       ← THE canonical category list
│   │   │   └── env.js              ← environment resolution
│   │   ├── controllers/
│   │   │   ├── chat.controller.js
│   │   │   └── expenses.controller.js
│   │   ├── db/
│   │   │   └── index.js            ← connection + schema initialisation
│   │   ├── migrations/
│   │   │   └── 001_create_expenses.sql
│   │   ├── routes/
│   │   │   ├── chat.routes.js
│   │   │   └── expenses.routes.js
│   │   ├── services/
│   │   │   ├── chat.agent.js       ← Gemini loop + system instruction
│   │   │   ├── chat.tools.js       ← tool schemas + validated handlers
│   │   │   ├── expenses.service.js ← all SQL lives here
│   │   │   └── gemini.client.js    ← SDK wrapper + retry policy
│   │   └── utils/
│   │       ├── errors.js           ← response envelope helpers
│   │       └── money.js            ← rupee ⇄ paise conversion
│   └── tests/
│       ├── README.md
│       ├── api-categories.js       ← HTTP-layer category rules
│       ├── api-smoke.js            ← idempotency & concurrency checks
│       ├── categories.js           ← tool-layer category rules
│       ├── chat-tools.js           ← tool validation & period logic
│       ├── config-check.js         ← environment configuration checks
│       └── expense-tracker.postman_collection.json
│
└── frontend/
    ├── package.json
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx                 ← application shell & state
        ├── api/
        │   ├── chat.js
        │   └── expenses.js
        ├── config/
        │   └── categories.js       ← mirrors the backend list
        ├── components/
        │   ├── Chatbot.jsx
        │   ├── ExpenseForm.jsx
        │   ├── ExpenseSummary.jsx
        │   ├── ExpenseTable.jsx
        │   └── AnalyticsView.jsx
        ├── styles.css
        └── test/
            ├── setup.js
            ├── chatbot.test.jsx
            └── expense-form.test.jsx
```

> **Note:** `frontend/src/components/AnalyticsView.jsx` is a developed but not
> yet wired-in component; the shell currently renders the Dashboard and
> Transactions views. See [Roadmap](#roadmap).

---

## Prerequisites

| Requirement | Version |
| --- | --- |
| Node.js | 18 or newer (the backend uses the global `fetch`) |
| npm | 9 or newer |
| Google AI Studio API key | [Get one](https://aistudio.google.com/apikey) |

A Gemini key is only required for the chat features. The REST API and dashboard
work without one.

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/Akshat270302/Fenmo-demo.git
cd Fenmo-demo

# 2. Install backend dependencies
cd backend
npm install

# 3. Configure the environment
cp .env.example .env      # Windows: copy .env.example .env
#    then edit .env and set GEMINI_API_KEY

# 4. Install frontend dependencies
cd ../frontend
npm install
```

The SQLite database and its schema are created automatically on first backend
start. No manual migration step is required.

---

## Environment Variables

All backend configuration lives in `backend/.env`. The file is gitignored;
`.env.example` is committed as a template. A local `.env` always takes
precedence over an inherited OS-level variable of the same name.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port the Express server listens on (1–65535). |
| `NODE_ENV` | `development` | Runtime environment: `development`, `production` or `test`. |
| `GEMINI_API_KEY` | *(empty)* | Google AI Studio API key. Required for chat; never logged. |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Model id used for the assistant. |
| `GEMINI_API_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | Generative Language API base URL. |
| `GEMINI_TIMEOUT_MS` | `30000` | Per-request timeout for Gemini calls, in milliseconds. |
| `FENMO_DB_PATH` | `backend/data/expenses.db` | Overrides the database file location. Used by tests to isolate state. |

The frontend reads one optional variable:

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:3000` | Base URL of the backend API. |

---

## Running the Application

Two terminals are required: the backend and the frontend run independently.

### Backend

```bash
cd backend
npm run dev      # nodemon, restarts on change
# or
npm start        # plain node
```

The server prints its resolved configuration on start:

```
Server listening on port 3000
[config] env=development source=.../backend/.env geminiModel=gemini-3.8-flash geminiConfigured=true
```

### Frontend

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173**. The frontend sends API requests to the backend
at `VITE_API_URL` (default `http://localhost:3000`).

### Production build

```bash
cd frontend
npm run build      # → frontend/dist
npm run preview    # serve the build locally
```

---

## API Reference

Base URL: `http://localhost:3000`

Every response uses the same envelope:

```json
{ "success": true,  "data": { }, "error": null }
{ "success": false, "data": null, "error": { "message": "…", "code": "…" } }
```

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | `GET` | Liveness probe. |
| `/expenses` | `POST` | Create an expense (idempotent). |
| `/expenses` | `GET` | List expenses, optionally filtered by category. |
| `/chat` | `POST` | Send a message to the assistant. |

### `GET /health`

```bash
curl http://localhost:3000/health
```

```json
{ "success": true, "data": { "status": "ok" }, "error": null }
```

### `POST /expenses`

Creates an expense. **The `Idempotency-Key` header is required.** Reusing a key
replays the original record and returns `200` instead of `201`.

```bash
curl -X POST http://localhost:3000/expenses \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 4f1b0a2c-1d3e-4a5b-8c9d-0e1f2a3b4c5d" \
  -d '{
        "amount": 24.5,
        "category": "Food & Dining",
        "date": "2026-05-01",
        "description": "Lunch"
      }'
```

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `amount` | number | yes | Positive, at most 2 decimal places, ≤ 100,000,000. |
| `category` | string | yes | Must be one of the canonical categories (see below). |
| `date` | string | no | ISO date (`YYYY-MM-DD`). Defaults to today. |
| `description` | string | no | Free-text note. |

**Response: `201 Created`**

```json
{
  "success": true,
  "data": {
    "expense": {
      "id": "0dc63392-4dbb-4a48-852e-ea35bc63ecf5",
      "amount": "24.50",
      "category": "Food & Dining",
      "description": "Lunch",
      "date": "2026-05-01",
      "created_at": "2026-10-22T07:00:50.951Z",
      "idempotency_key": "4f1b0a2c-1d3e-4a5b-8c9d-0e1f2a3b4c5d"
    }
  },
  "error": null
}
```

> Amounts are returned as strings with two decimal places because they are
> derived from integer paise.

**Responses**

| Status | Code | Condition |
| --- | --- | --- |
| `201` | n/a | Expense created. |
| `200` | n/a | The `Idempotency-Key` was already used; the original record is replayed. |
| `400` | `VALIDATION_ERROR` | Missing `Idempotency-Key`, missing/invalid amount, missing category, unsupported category, malformed date. |
| `500` | `SERVER_ERROR` | Unexpected database or server failure. |

### `GET /expenses`

Returns expenses ordered by date (descending), then creation time. Amounts are
returned in rupees as strings.

```bash
curl "http://localhost:3000/expenses"
curl "http://localhost:3000/expenses?category=Food%20%26%20Dining"
```

**Response: `200 OK`**

```json
{
  "success": true,
  "data": {
    "expenses": [
      {
        "id": "0dc63392-4dbb-4a48-852e-ea35bc63ecf5",
        "amount": "24.50",
        "category": "Food & Dining",
        "description": "Lunch",
        "date": "2026-05-01",
        "created_at": "2026-10-22T07:00:50.951Z",
        "idempotency_key": "4f1b0a2c-1d3e-4a5b-8c9d-0e1f2a3b4c5d"
      }
    ],
    "total": "24.50"
  },
  "error": null
}
```

### `POST /chat`

Sends one turn to the assistant.

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
        "message": "Add 321 rupees for Books under Entertainment dated 2026-05-14.",
        "sessionId": "c1f4e0de-5c2a-4a9f-9c3f-9a0f6f2b7a11",
        "turnId": "c1f4e0de-5c2a-4a9f-9c3f-9a0f6f2b7a11-turn-1",
        "history": []
      }'
```

**Request body**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `message` | string | yes | Non-empty, max 2000 characters. |
| `sessionId` | string | no | Groups a conversation. Generated client-side when omitted. |
| `turnId` | string | no | Idempotency key for a single turn. Replaying the same `turnId` replays the original tool calls instead of creating duplicates. |
| `history` | array | no | Prior turns as `{ role, content }` objects. |

**Response: `200 OK`**

```json
{
  "success": true,
  "data": {
    "reply": "Added an expense of 321.00 for \"Books\" under Entertainment on 14 May 2026.",
    "toolCalls": [{ "name": "create_expense", "ok": true }],
    "createdExpenses": [
      {
        "id": "0dc63392-4dbb-4a48-852e-ea35bc63ecf5",
        "amount": "321.00",
        "category": "Entertainment",
        "description": "Books",
        "date": "2026-05-14",
        "createdAt": "2026-10-22T07:00:50.951Z"
      }
    ],
    "sessionId": "c1f4e0de-5c2a-4a9f-9c3f-9a0f6f2b7a11"
  },
  "error": null
}
```

**Error responses**

| Status | Code | Condition |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Missing or oversized message. |
| `503` | `SERVICE_UNAVAILABLE` | `GEMINI_API_KEY` is not configured. |
| `500` | `SERVER_ERROR` | Unexpected failure while handling the turn. |

---

## Expense Categories

Every new expense is filed under one of exactly **six canonical categories**,
defined once in `backend/src/config/categories.js`:

| Category | Typical use |
| --- | --- |
| `Food & Dining` | Groceries, restaurants, cafés, takeout |
| `Travel` | Fuel, cabs, flights, hotels, local transport |
| `Bills` | Rent, utilities, electricity, subscriptions |
| `Health` | Medical bills, medicines, doctor visits, fitness |
| `Entertainment` | Movies, music, games, books, events |
| `Other` | Anything that does not fit a specific category |

### Rules

- The list is **enforced**, not merely suggested. `POST /expenses` and the
  chatbot's `create_expense` tool both reject anything outside it with
  `400 VALIDATION_ERROR`.
- Matching is **case-insensitive** and the value is stored with its canonical
  casing, so `food & dining` and `Food & Dining` can never become two different
  categories in the database.
- Well-known **synonyms are mapped** onto their canonical category: `food`,
  `groceries`, `dining`, `restaurant` → `Food & Dining`; `transport`, `cab`,
  `taxi`, `fuel` → `Travel`; `utilities`, `rent`, `electricity` → `Bills`;
  `medical`, `medicine`, `doctor` → `Health`; `movie`, `music`, `games` →
  `Entertainment`; `misc` → `Other`.
- `Other` is the **catch-all**. It replaces the previous free-text "custom
  category" input, so no arbitrary strings can enter the database.
- The chatbot is offered **only** the canonical list, so the model can never
  learn a legacy category name and create a record under it.
- **Existing rows are never rewritten.** Records created before this list
  existed keep their original category value and remain fully queryable.

> The frontend keeps a mirrored copy of the list in
> `frontend/src/config/categories.js` for the form's dropdown. The **backend is
> authoritative** and will reject anything the two lists disagree on.

---

## Chat Tools

The assistant reaches the database only through two validated tools. The model
never emits SQL: it supplies structured arguments, which the server validates
and binds as parameters.

### `query_expenses`

Reads stored records and returns exact totals, per-category subtotals and the
matching transactions.

| Argument | Type | Notes |
| --- | --- | --- |
| `period` | string | `today`, `yesterday`, `last7Days`, `last30Days`, `thisMonth`, `lastMonth`, `thisYear`, `allTime`. |
| `startDate` / `endDate` | string | Inclusive ISO dates, `YYYY-MM-DD`. Use them together. |
| `category` | string | Optional filter; must be one of the canonical categories. |

Period arithmetic is performed on the server, so the model cannot
mis-compute a date range.

### `create_expense`

Records a new transaction.

| Argument | Type | Required | Notes |
| --- | --- | --- | --- |
| `amount` | number | yes | Positive number in rupees, ≤ 100,000,000. |
| `category` | string | yes | Must be a canonical category or a known synonym. |
| `description` | string | no | Free-text note, max 200 characters. |
| `date` | string | no | `YYYY-MM-DD`. Defaults to today. |

### Tool safety

- Both declarations carry an `enum` of the canonical categories, so the model
  is steered toward valid values at the schema level.
- Every argument is re-validated server-side: the schema is a hint, not a
  guarantee.
- Missing or invalid arguments raise a typed `ToolInputError`, which the agent
  turns into a conversational clarification instead of a failed request.
- Tool calls inherit an idempotency key derived from
  `sessionId` + `turnId` + argument hash, so a retried turn cannot create a
  duplicate row.

---

## Database

SQLite, stored at `backend/data/expenses.db`. The schema is created
idempotently from `backend/src/migrations/001_create_expenses.sql` on startup.

```sql
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL,      -- stored in paise
  category TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,            -- YYYY-MM-DD
  created_at TEXT NOT NULL,      -- ISO-8601 timestamp
  idempotency_key TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses (category);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date);
```

**Schema notes**

- `amount` is an `INTEGER` count of paise, so there is no floating-point money.
- `idempotency_key` is `UNIQUE`, which is what makes duplicate creates
  impossible at the storage layer.
- `PRAGMA foreign_keys = ON` is applied at initialisation.

**Money handling**

| Conversion | Behaviour |
| --- | --- |
| Rupees → paise | Regex-validated, integer math only (`24.5` → `2450`). Rejects negatives, zero and >2 decimals. |
| Paise → rupees | `(paise / 100).toFixed(2)`, always two decimals. |

---

## Testing

### Backend

```bash
cd backend
npm test                 # runs the four standalone suites
npm run test:config      # environment configuration
npm run test:categories  # category rules (tool layer)
npm run test:tools       # tool validation, period logic, idempotency keys
npm run test:api         # category rules (HTTP layer)
npm run test:smoke       # needs a running server; idempotency & concurrency
```

| Suite | Covers |
| --- | --- |
| `config-check.js` | `.env` is loaded, the model default is current, a local `.env` overrides an inherited OS-level key, `.env.example` exists without a real key. |
| `categories.js` | The canonical list is exactly the six categories; every one is accepted by `create_expense`; unsupported values are rejected; `Other` is a real category; casing is normalised; synonyms resolve to canonical values; the chatbot is offered only canonical categories. |
| `chat-tools.js` | Tool argument validation (amount, category, date, period), unknown tool names, period resolution against a reference date, idempotency key derivation. |
| `api-categories.js` | Every canonical category is accepted over HTTP; unsupported categories return `400 VALIDATION_ERROR`; a missing category is reported as missing; only canonical values reach the database. |

The four standalone suites run against an **isolated temporary database** via
`FENMO_DB_PATH`, so the development data is never read or written.

The `test:smoke` script is separate: it expects a server already running on
`http://localhost:3000` and exercises idempotency replay, a concurrent-write
race and paise integrity.

### Frontend

```bash
cd frontend
npm test           # run once
npm run test:watch # watch mode
```

| Suite | Covers |
| --- | --- |
| `chatbot.test.jsx` | Suggestion chips render before the first message; sending a typed message and a suggestion chip; prior turns are forwarded as `history`; the parent is notified when an expense is created (and not otherwise); error display and the retry flow reusing the same `turnId`; input and send button disabled while a request is in flight; empty messages are not sent. |
| `expense-form.test.jsx` | Exactly the six categories are offered; the removed custom-category field is gone; `Other` submits as a normal category; the form resets after a successful submit; API errors are surfaced. |

### Manual testing

A Postman collection is included at
`backend/tests/expense-tracker.postman_collection.json`. Import it, set
`baseUrl`, and run the request set.

---

## Design Decisions

### One canonical category list

The category list lives in a single backend module and is enforced at every
write path. An earlier design derived the chatbot's allowed categories from
`SELECT category ... GROUP BY category`. That fed whatever happened to be in
the database back to the model, so legacy values such as `Friends` and `clothes`
became "valid" categories and new rows were created under them. The list is now
static and authoritative; the database is never consulted to decide what is
valid.

### Legacy rows are preserved, not migrated

Enforcing a canonical list does not imply rewriting history. Existing records
keep their original category value and stay queryable; the filter resolver
still matches them directly. A data migration was deliberately avoided so no
user record is silently altered.

### Money is stored in paise

Amounts are held as integer paise and converted with integer arithmetic. A
float-based total accumulates error over many rows; an integer total does not.
The trade-off is that amounts cross the API boundary as strings (`"24.50"`),
which is the correct choice for a monetary value.

### The model never touches SQL

The assistant can only act through two declared tools. Every argument is
re-validated server-side and bound as a SQL parameter, so a malformed or
adversarial model output cannot reach the database as executable SQL.

### Idempotency at two levels

REST creates are protected by the `Idempotency-Key` header; chat turns are
protected by a key derived from `sessionId` + `turnId` + argument hash. Both
rely on the `UNIQUE` constraint on `expenses.idempotency_key`, so a duplicate is
rejected by the database even under a concurrent race.

### Period arithmetic runs on the server

Named periods are resolved to concrete date bounds in `resolvePeriod`, not by
the model. Date maths is deterministic and testable when it lives in
ordinary code, and unreliable when it is delegated to a language model.

### A local `.env` wins over the OS environment

`dotenv` is loaded with `override: true`. On Windows a machine-level
`GEMINI_API_KEY` would otherwise shadow the key in the project's `.env`, which
is a confusing failure to debug.

### Gemini calls are retried with backoff

Transient failures (rate limits, 5xx, deadline exceeded) are common enough
that a single failed request should not abort a chat turn. The client retries
up to twice with exponential backoff for retryable errors only.

---

## Security Considerations

- **The Gemini API key never reaches the browser.** All model calls happen in
  the backend; the frontend talks only to the local API.
- **The key is never logged.** Startup output reports only whether a key is
  configured and which model is selected.
- **`.env` is gitignored**; only `.env.example` is committed, and a test
  asserts it contains no real key.
- **All SQL is parameterised.** No string interpolation of user or model input
  into SQL exists anywhere in the codebase.
- **Input is validated at the boundary**: amount, category, date, message
  length and idempotency key are all checked before use.
- **CORS is currently open** (`cors()` with no origin restriction), which is
  appropriate for local development. A production deployment should restrict
  the allowed origins.
- **No authentication or authorization** is implemented. The API is intended
  for a single-user local or trusted-network deployment; exposing it publicly
  requires an auth layer.
- **The database file is committed** in this repository for demonstration
  purposes. For a real deployment, add `backend/data/*.db` to `.gitignore` and
  manage the file as an untracked artifact.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Chat is unavailable because the Gemini API key is not configured.` | `GEMINI_API_KEY` is missing or empty. | Copy `backend/.env.example` to `backend/.env` and set the key from [Google AI Studio](https://aistudio.google.com/apikey). |
| Chat fails with a 404 from the Gemini API | The base URL already ends in `/v1beta`, producing `/v1beta/v1beta/...`. | The client splits the base URL automatically. Set `GEMINI_API_BASE_URL` to `https://generativelanguage.googleapis.com/v1beta`. |
| `gemini-2.5-flash ... no longer available to new users` | A retired model id is configured. | Set `GEMINI_MODEL=gemini-3.8-flash`. |
| `Port 3000 is already in use` | Another process holds the port. | Stop it, or set `PORT` in `backend/.env`. |
| The dashboard shows no data | The backend is not running, or `VITE_API_URL` points elsewhere. | Start the backend and confirm `http://localhost:3000/health` responds. |
| `Unsupported category "..."` | A category outside the canonical six was submitted. | Use one of the six categories, or the catch-all `Other`. |
| The form cannot submit | The category was left as the empty placeholder. | Select a category; it is a required field. |
| Tests fail with a database lock | A previous test process is still running. | Stop stray `node` processes; every suite uses its own temporary database. |
| The assistant repeats an expense | A retried turn was sent with a new `turnId`. | Keep the `turnId` stable for a given message. The built-in Retry button already does this. |

---

## Roadmap

- [ ] Wire `AnalyticsView.jsx` into the application shell as a third view.
- [ ] Add authentication and per-user data isolation.
- [ ] Restrict CORS origins and add a production deployment configuration.
- [ ] Add recurring expenses and budgets with alerts.
- [ ] Support multi-currency with an exchange-rate source.
- [ ] Export to CSV and add charts to the analytics view.
- [ ] Replace the mirrored frontend category list with a shared package or a
      server-provided endpoint.
- [ ] Add a `GET /expenses` date-range filter at the API level.

---

## License

This project is released under the **MIT License**.

```
MIT License

Copyright (c) 2026 SmartSpend

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">

**SmartSpend Expense Tracker**: track what you spend, by asking.

</div>