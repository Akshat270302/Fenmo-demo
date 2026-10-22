# Fenmo Frontend

React + Vite dashboard for the Fenmo expense tracker, including the Gemini-backed
chat assistant.

## Setup
```bash
cd frontend
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` and proxies to the backend API.
Point it somewhere else with `VITE_API_URL`:

```bash
VITE_API_URL=http://localhost:3000 npm run dev
```

## Scripts
| Script | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server. |
| `npm run build` | Production build into `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Run the Vitest component tests once. |
| `npm run test:watch` | Run the tests in watch mode. |

## Chat Assistant
- The assistant panel lives in `src/components/Chatbot.jsx` and talks to
  `POST /chat` through `src/api/chat.js`.
- Suggestion chips let the user start from a common question.
- Each user message gets a stable `turnId`. If a request fails, the error is
  shown with a **Retry** button that replays the *same* `turnId`, so the
  backend returns the original result instead of creating a duplicate expense.
- When the assistant records an expense, the dashboard list and totals are
  refreshed.
- Conversation context is kept client-side and sent back as `history` on each
  turn.

## Tests
`src/test/chatbot.test.jsx` covers:
- suggestion chips are rendered before the first message
- sending a typed message and rendering the assistant reply
- sending a suggestion chip
- prior turns are forwarded as `history`
- the parent is notified when an expense is created (and not otherwise)
- error display and the retry flow reusing the same `turnId`
- the input and send button are disabled while a request is in flight
- empty messages are not sent

Run them with `npm test`.
