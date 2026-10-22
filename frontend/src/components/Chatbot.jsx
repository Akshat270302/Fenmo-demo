import { useEffect, useMemo, useRef, useState } from "react";
import { sendChatMessage } from "../api/chat.js";

const SUGGESTIONS = [
  "How much did I spend this month?",
  "What did I spend on food?",
  "Add ₹250 for dinner under Food & Dining",
  "Compare this month with last month",
];

const createId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const Chatbot = ({ onExpenseCreated }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  // The last attempted turn is kept so an explicit retry reuses the exact same
  // `turnId`. Reusing it lets the backend replay the original tool calls
  // instead of creating a duplicate expense.
  const [retryableTurn, setRetryableTurn] = useState(null);
  const sessionId = useMemo(createId, []);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const runTurn = async (turn) => {
    setErrorMessage("");
    setSending(true);
    setRetryableTurn(null);

    try {
      const data = await sendChatMessage({
        message: turn.message,
        history: turn.history,
        sessionId,
        turnId: turn.turnId,
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || "I couldn't answer that." },
      ]);

      if (Array.isArray(data.createdExpenses) && data.createdExpenses.length > 0) {
        if (onExpenseCreated) {
          onExpenseCreated();
        }
      }
    } catch (err) {
      setErrorMessage(err.message || "Failed to reach the assistant");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I hit an error while handling that request. Please try again.",
        },
      ]);
      // The turn is retained so the retry button can replay it with the same id.
      setRetryableTurn(turn);
    } finally {
      setSending(false);
    }
  };

  const handleSend = (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || sending) {
      return;
    }

    const userMessage = { role: "user", content: trimmed };
    const history = messages.map(({ role, content }) => ({ role, content }));
    // A stable id per user message. If the request is retried, the backend
    // replays the same idempotent tool call instead of creating a duplicate.
    const turn = { message: trimmed, history, turnId: createId() };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    runTurn(turn);
  };

  const handleRetry = () => {
    if (!retryableTurn || sending) {
      return;
    }
    runTurn(retryableTurn);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    handleSend(input);
  };

  return (
    <section className="card chat-card">
      <div className="card-header">
        <div>
          <div className="card-title-row">
            <span className="icon-circle">✦</span>
            <h2 className="card-title">Fenmo Assistant</h2>
          </div>
          <p className="muted">
            Ask about your spending or record an expense by typing.
          </p>
        </div>
      </div>

      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p className="muted">
              Try one of these to get started.
            </p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  className="chat-suggestion"
                  key={suggestion}
                  type="button"
                  onClick={() => handleSend(suggestion)}
                  disabled={sending}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              className={`chat-bubble ${message.role === "user" ? "from-user" : "from-bot"}`}
              key={`${message.role}-${index}`}
            >
              {message.content}
            </div>
          ))
        )}

        {sending ? (
          <div className="chat-bubble from-bot chat-typing">Thinking…</div>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="error">
          {errorMessage}
          {retryableTurn ? (
            <button
              className="chat-retry"
              type="button"
              onClick={handleRetry}
              disabled={sending}
            >
              Retry
            </button>
          ) : null}
        </p>
      ) : null}

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Ask about your expenses…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={sending}
          aria-label="Message"
        />
        <button className="button primary" type="submit" disabled={sending || !input.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
};

export default Chatbot;
