# Backend Test Artifacts

## Config Check
- Run with Node 18+
- `npm run test:config` (from `backend/`) or `node backend/tests/config-check.js`
- Verifies `.env` is loaded, the default model is `gemini-3.8-flash` (not the
  retired `gemini-2.5-flash`), a local `.env` overrides an inherited OS-level
  `GEMINI_API_KEY`, and `.env.example` exists without a real key.

## Chat Tool Tests
- Run with Node 18+
- `npm run test:tools` (from `backend/`) or `node backend/tests/chat-tools.js`
- Covers tool argument validation (amount, category, date, period), unknown
  tool names, period resolution against the reference date, and the
  idempotency key derivation:
  - the same session/turn/arguments produce the same key
  - a different turn produces a different key
  - two identical calls in one turn are distinguished by the occurrence index
- Uses an isolated database via `FENMO_DB_PATH`, so it never touches the
  development database.

## Category Tests
- Run with Node 18+
- `npm run test:categories` (from `backend/`) or `node backend/tests/categories.js`
- Covers the canonical category list and the rules that protect it:
  - the canonical list is exactly the six supported categories
  - every canonical category is accepted by the `create_expense` tool
  - unsupported categories (e.g. `Friends`, `clothes`) are rejected
  - `Other` is a real category, not a custom free-text one
  - casing is normalised onto the canonical value
  - known synonyms (e.g. `groceries`) are stored under their canonical name
  - the chatbot is only offered the canonical categories
  - a synonym filter resolves to the canonical category
- Uses an isolated database via `FENMO_DB_PATH`, so it never touches the
  development database.

## API Category Tests
- Run with Node 18+
- `npm run test:api` (from `backend/`) or `node backend/tests/api-categories.js`
- Boots the Express app on an ephemeral port against an isolated database and
  covers the HTTP layer:
  - every canonical category is accepted by `POST /expenses`
  - unsupported categories are rejected with `400 VALIDATION_ERROR`
  - a missing category is reported as missing
  - only canonical categories are ever written to the database

## Postman Collection
- Import [backend/tests/expense-tracker.postman_collection.json](backend/tests/expense-tracker.postman_collection.json)
- Set `baseUrl` to your API host (default: http://localhost:3000)
- Run the disabled "DB failure simulation (manual)" request only after stopping the API or breaking DB access.

## Smoke Script
- Run with Node 18+
- `node backend/tests/api-smoke.js`
- Includes: idempotency same-key different-body, race condition via Promise.all, and DB paise integrity check.
