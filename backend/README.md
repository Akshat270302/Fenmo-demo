# Expense Tracker API

A backend API for tracking expenses with validation, idempotent creates, filterable
queries, and a Gemini-powered conversational assistant.

## Features
- Create expenses with `POST /expenses`
- Idempotency via `Idempotency-Key` header
- Input validation for amount, category, and date
- Fetch expenses with filters using `GET /expenses`
- Standard API response format
- Consistent error handling
- Conversational assistant at `POST /chat` backed by Gemini function calling
- Safe, parameterized tool execution (the model never emits raw SQL)
- Turn-level idempotency so a retried request cannot double-create an expense

## Tech Stack
- Node.js
- Express
- SQLite
- `@google/genai` (Gemini API)

## API Endpoints

### POST /chat
Ask a question in natural language or record an expense by describing it.

**Example request**
```http
POST /chat
Content-Type: application/json
```

```json
{
  "message": "Add an expense of ₹321 for Books under Entertainment dated 2026-05-14.",
  "sessionId": "c1f4e0de-5c2a-4a9f-9c3f-9a0f6f2b7a11",
  "turnId": "c1f4e0de-5c2a-4a9f-9c3f-9a0f6f2b7a11-turn-1",
  "history": []
}
```

**Example response**
```json
{
  "success": true,
  "data": {
    "reply": "Added an expense of ₹321.00 for \"Books\" under Entertainment on 14 May 2026.",
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

**Request fields**

| Field | Required | Notes |
| --- | --- | --- |
| `message` | yes | Non-empty, max 2000 characters. |
| `sessionId` | no | Groups a conversation. Generated client-side when omitted. |
| `turnId` | no | Idempotency key for a single turn. Replaying the same `turnId` replays the original tool calls instead of creating duplicates. |
| `history` | no | Prior turns as `{ role, content }` objects. |

**Validation errors** return `400` with `error.code = "VALIDATION_ERROR"`.

### POST /expenses
Create a new expense.

**Example request**
```http
POST /expenses
Content-Type: application/json
Idempotency-Key: your-unique-key
```

```json
{
  "amount": 24.5,
  "category": "Food",
  "date": "2026-05-01",
  "note": "Lunch"
}
```

**Example response**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "amount": 24.5,
    "category": "Food",
    "date": "2026-05-01",
    "note": "Lunch"
  }
}
```

### GET /expenses
Fetch expenses with optional filters.

**Example request**
```http
GET /expenses?category=Food&startDate=2026-05-01&endDate=2026-05-31
```

**Example response**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "amount": 24.5,
      "category": "Food",
      "date": "2026-05-01",
      "note": "Lunch"
    }
  ]
}
```

## Request & Response Format

**Standard success response**
```json
{
  "success": true,
  "data": {}
}
```

**Standard error response**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Amount must be a positive number"
  }
}
```

## Idempotency
Send the same `Idempotency-Key` with repeated `POST /expenses` requests. The server returns the original response for duplicate requests instead of creating a new record.

## Assistant Design

### Safety
- The model never produces SQL. It selects from a fixed tool surface
  (`query_expenses`, `create_expense`) and the server builds parameterized
  statements from validated arguments.
- Unknown tool names are rejected and reported back to the model instead of
  being executed.
- Named periods ("this month", "last week") are resolved against the trusted
  server date, not a date the model invents.

### Idempotency of chat turns
Idempotency for a chat turn is derived from the session id, the turn id, the
tool name, the canonicalized arguments, and the occurrence index of that call
within the turn. It deliberately does **not** depend on Gemini function-call
ids, which are not stable across retries. Replaying the same `turnId` therefore
replays the original tool calls and returns the original created expense
instead of inserting a duplicate row.

The derived key is stored in the `expenses.idempotency_key` column, which is
`UNIQUE`. The service looks the key up before inserting, and if two concurrent
requests race, the losing insert fails with `SQLITE_CONSTRAINT` and falls back
to returning the already-stored row. The guarantee therefore lives in the
database rather than in process memory, so it holds across server restarts.

Gemini 3.x continuations preserve function-call ids and `thoughtSignature`,
which keeps multi-step tool loops working when a turn spans several model
round-trips.

### Transient failures
Transient Gemini errors (for example `504` overload responses) are retried with
backoff before the turn is failed.

## Setup (Local)
```bash
git clone <your-repo-url>
cd backend
npm install
cp .env.example .env   # then fill in GEMINI_API_KEY
npm start
```

## Environment Configuration

All environment variables are resolved by `src/config/env.js`, which is loaded
first thing in `src/server.js`.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | Port the API listens on. |
| `NODE_ENV` | `development` | `development`, `production` or `test`. |
| `GEMINI_API_KEY` | _(none)_ | Google AI Studio key. Required for Gemini features. |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Model id. |
| `GEMINI_API_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | API base URL. |
| `GEMINI_TIMEOUT_MS` | `30000` | Request timeout in milliseconds. |

A few things worth knowing:

- **`.env` wins over the OS environment.** The file is loaded with
  `dotenv.config({ override: true })`, so a local `backend/.env` always takes
  precedence over a machine-level environment variable of the same name. This
  avoids a stale OS-level `GEMINI_API_KEY` silently shadowing the key in
  `backend/.env` (a common problem on Windows).
- **`.env` is gitignored.** Only `.env.example` is committed, and it never
  contains a real key.
- **The key is never logged.** Startup prints the resolved model and whether
  credentials are present, but never the key itself.
- **`gemini-2.5-flash` is retired** for new projects and now returns an
  error, so `gemini-3.8-flash` is the default.

To generate a key, visit https://aistudio.google.com/apikey

## Project Structure
```
backend/
  src/
    config/
      env.js        # centralised env loading + validation
    controllers/
    services/
    routes/
    db/
    utils/
    app.js
    server.js
```

## Deployment
- Live API URL: <YOUR_API_URL>
- Live Frontend URL: <YOUR_FRONTEND_URL>

## Testing
- `npm test` — runs the configuration checks and the chat tool tests
  - `npm run test:config` — env loading, model default, key resolution, `.env.example` template
  - `npm run test:tools` — tool validation, unknown-tool handling, argument validation
- `npm run test:smoke` — API smoke tests against a running server
  - Set `BASE_URL` if the server is not on `http://localhost:3000`
- Postman collection included
- Idempotency testing covered
- Edge case testing (invalid input, duplicate requests)

## Known Limitations
- `POST /chat` requires `GEMINI_API_KEY`; without credentials the endpoint
  returns `503` with `error.code = "SERVICE_UNAVAILABLE"`.
- The chat endpoint is stateless on the server side. Conversation context is
  supplied by the client through `history`, so a client that drops the
  `history` array loses the prior context.
- The `turnId` is hashed together with the session, tool name, canonicalized
  arguments, and occurrence index. Because the resulting key is stored in the
  `expenses.idempotency_key` column (which is `UNIQUE`), a replayed turn is
  recognized even after a server restart, and the original expense is returned
  instead of a second row.
- Replaying a turn only replays the *tool calls*. The natural-language reply is
  regenerated, so the wording may differ slightly from the original response.
- There is no authentication; anyone who can reach the API can read and
  create expenses.

## Future Improvements
- Authentication and user accounts
- Pagination and sorting
- Export to CSV
