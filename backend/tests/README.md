# Backend Test Artifacts

## Postman Collection
- Import [backend/tests/expense-tracker.postman_collection.json](backend/tests/expense-tracker.postman_collection.json)
- Set `baseUrl` to your API host (default: http://localhost:3000)
- Run the disabled "DB failure simulation (manual)" request only after stopping the API or breaking DB access.

## Smoke Script
- Run with Node 18+
- `node backend/tests/api-smoke.js`
- Includes: idempotency same-key different-body, race condition via Promise.all, and DB paise integrity check.
