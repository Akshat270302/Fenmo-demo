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

## Postman Collection
- Import [backend/tests/expense-tracker.postman_collection.json](backend/tests/expense-tracker.postman_collection.json)
- Set `baseUrl` to your API host (default: http://localhost:3000)
- Run the disabled "DB failure simulation (manual)" request only after stopping the API or breaking DB access.

## Smoke Script
- Run with Node 18+
- `node backend/tests/api-smoke.js`
- Includes: idempotency same-key different-body, race condition via Promise.all, and DB paise integrity check.
