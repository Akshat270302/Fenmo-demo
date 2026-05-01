const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const handleResponse = async (response) => {
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "Request failed";
    throw new Error(message);
  }
  return data?.data;
};

export const getExpenses = async (category) => {
  const url = new URL(`${API_BASE_URL}/expenses`);
  if (category) {
    url.searchParams.set("category", category);
  }

  const response = await fetch(url.toString());
  return handleResponse(response);
};

export const createExpense = async (payload, idempotencyKey) => {
  const response = await fetch(`${API_BASE_URL}/expenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
};
