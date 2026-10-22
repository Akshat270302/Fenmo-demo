import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import Chatbot from "../components/Chatbot.jsx";

const mockSendChatMessage = vi.fn();

vi.mock("../api/chat.js", () => ({
  sendChatMessage: (...args) => mockSendChatMessage(...args),
}));

const reply = (overrides = {}) => ({
  reply: "You spent 750 on Food & Dining.",
  toolCalls: [{ name: "query_expenses", ok: true }],
  createdExpenses: [],
  ...overrides,
});

describe("Chatbot", () => {
  beforeEach(() => {
    mockSendChatMessage.mockReset();
  });

  it("shows suggestion chips before any message is sent", () => {
    render(<Chatbot />);

    expect(
      screen.getByRole("button", { name: "How much did I spend this month?" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "What did I spend on food?" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Compare this month with last month" })
    ).toBeInTheDocument();
  });

  it("sends the typed message and renders the assistant reply", async () => {
    const user = userEvent.setup();
    mockSendChatMessage.mockResolvedValue(reply());

    render(<Chatbot />);

    await user.type(screen.getByLabelText("Message"), "How much did I spend?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("You spent 750 on Food & Dining.")).toBeInTheDocument();
    });

    expect(mockSendChatMessage).toHaveBeenCalledTimes(1);
    const payload = mockSendChatMessage.mock.calls[0][0];
    expect(payload.message).toBe("How much did I spend?");
    expect(payload.sessionId).toBeTruthy();
    expect(payload.turnId).toBeTruthy();
    expect(payload.history).toEqual([]);
  });

  it("renders the user message in the conversation log", async () => {
    const user = userEvent.setup();
    mockSendChatMessage.mockResolvedValue(reply());

    render(<Chatbot />);

    await user.type(screen.getByLabelText("Message"), "How much did I spend?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("How much did I spend?")).toBeInTheDocument();
    });
  });

  it("sends a suggestion chip when it is clicked", async () => {
    const user = userEvent.setup();
    mockSendChatMessage.mockResolvedValue(reply());

    render(<Chatbot />);

    await user.click(
      screen.getByRole("button", { name: "How much did I spend this month?" })
    );

    await waitFor(() => {
      expect(mockSendChatMessage).toHaveBeenCalledTimes(1);
    });
    expect(mockSendChatMessage.mock.calls[0][0].message).toBe(
      "How much did I spend this month?"
    );
  });

  it("passes the previous conversation as history on the next turn", async () => {
    const user = userEvent.setup();
    mockSendChatMessage
      .mockResolvedValueOnce(reply())
      .mockResolvedValueOnce(reply({ reply: "Second answer." }));

    render(<Chatbot />);

    await user.type(screen.getByLabelText("Message"), "first question");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(mockSendChatMessage).toHaveBeenCalledTimes(1));

    await user.type(screen.getByLabelText("Message"), "second question");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(mockSendChatMessage).toHaveBeenCalledTimes(2));

    const secondPayload = mockSendChatMessage.mock.calls[1][0];
    expect(secondPayload.history).toEqual([
      { role: "user", content: "first question" },
      { role: "assistant", content: "You spent 750 on Food & Dining." },
    ]);
  });

  it("notifies the parent when the assistant creates an expense", async () => {
    const user = userEvent.setup();
    const onExpenseCreated = vi.fn();
    mockSendChatMessage.mockResolvedValue(
      reply({
        createdExpenses: [{ id: "e1", amount: "250.00", category: "Food & Dining" }],
      })
    );

    render(<Chatbot onExpenseCreated={onExpenseCreated} />);

    await user.type(screen.getByLabelText("Message"), "Add 250 for dinner");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(onExpenseCreated).toHaveBeenCalledTimes(1);
    });
  });

  it("does not notify the parent when no expense was created", async () => {
    const user = userEvent.setup();
    const onExpenseCreated = vi.fn();
    mockSendChatMessage.mockResolvedValue(reply());

    render(<Chatbot onExpenseCreated={onExpenseCreated} />);

    await user.type(screen.getByLabelText("Message"), "How much did I spend?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("You spent 750 on Food & Dining.")).toBeInTheDocument();
    });
    expect(onExpenseCreated).not.toHaveBeenCalled();
  });

  it("surfaces an error and offers a retry that reuses the same turn id", async () => {
    const user = userEvent.setup();
    mockSendChatMessage
      .mockRejectedValueOnce(new Error("Chat is unavailable"))
      .mockResolvedValueOnce(reply({ reply: "Recovered answer." }));

    render(<Chatbot />);

    await user.type(screen.getByLabelText("Message"), "How much did I spend?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Chat is unavailable")).toBeInTheDocument();
    });
    expect(
      screen.getByText("I hit an error while handling that request. Please try again.")
    ).toBeInTheDocument();

    const firstTurnId = mockSendChatMessage.mock.calls[0][0].turnId;

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("Recovered answer.")).toBeInTheDocument();
    });

    expect(mockSendChatMessage).toHaveBeenCalledTimes(2);
    // The retry must reuse the original turn id so the backend can replay the
    // tool calls instead of creating a duplicate expense.
    expect(mockSendChatMessage.mock.calls[1][0].turnId).toBe(firstTurnId);
    expect(screen.queryByText("Chat is unavailable")).not.toBeInTheDocument();
  });

  it("disables the input and send button while a request is in flight", async () => {
    const user = userEvent.setup();
    let resolveRequest;
    mockSendChatMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    render(<Chatbot />);

    await user.type(screen.getByLabelText("Message"), "How much did I spend?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Thinking…")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();

    resolveRequest(reply());

    await waitFor(() => {
      expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("Message")).not.toBeDisabled();
  });

  it("does not send an empty message", async () => {
    const user = userEvent.setup();
    mockSendChatMessage.mockResolvedValue(reply());

    render(<Chatbot />);

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mockSendChatMessage).not.toHaveBeenCalled();
  });
});
