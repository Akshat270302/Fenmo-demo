const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const handleResponse = async (response) => {
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "Request failed";
    throw new Error(message);
  }
  return data?.data;
};

/**
 * Sends a chat turn to the backend.
 *
 * `history` is the prior conversation in the `{ role, content }` shape used by
 * the UI. The backend owns the Gemini call, so the API key never reaches the
 * browser.
 *
 * `turnId` must stay stable for a given message: it is what lets the backend
 * replay an already-created expense instead of duplicating it when the
 * request is retried.
 */
export const sendChatMessage = async ({ message, history, sessionId, turnId }) => {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, history, sessionId, turnId }),
  });

  return handleResponse(response);
};
