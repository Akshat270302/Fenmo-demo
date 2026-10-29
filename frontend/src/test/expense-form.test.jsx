import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ExpenseForm from "../components/ExpenseForm.jsx";
import { EXPENSE_CATEGORIES } from "../config/categories.js";

const EXPECTED_CATEGORIES = [
  "Food & Dining",
  "Travel",
  "Bills",
  "Health",
  "Entertainment",
  "Other",
];

describe("ExpenseForm categories", () => {
  it("offers exactly the six canonical categories", () => {
    render(<ExpenseForm onCreate={vi.fn()} />);

    const select = screen.getByLabelText("Category");
    const options = Array.from(select.querySelectorAll("option")).map(
      (option) => option.value
    );

    // The leading "Select category" placeholder is not a real category.
    expect(options.slice(1)).toEqual(EXPECTED_CATEGORIES);
    expect(options.slice(1)).toEqual(EXPENSE_CATEGORIES);
  });

  it("does not offer a custom free-text category for 'Other'", () => {
    render(<ExpenseForm onCreate={vi.fn()} />);

    expect(screen.queryByLabelText("Custom category")).not.toBeInTheDocument();
  });

  it("submits the selected category without asking for a custom one", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(<ExpenseForm onCreate={onCreate} />);

    await user.type(screen.getByLabelText("Amount (INR)"), "120");
    await user.selectOptions(screen.getByLabelText("Category"), "Other");
    await user.type(screen.getByLabelText("Description"), "misc");
    await user.type(screen.getByLabelText("Transaction Date"), "2026-05-01");
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    expect(onCreate).toHaveBeenCalledWith({
      amount: "120",
      category: "Other",
      description: "misc",
      date: "2026-05-01",
    });
  });

  it("resets the form after a successful submit", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(<ExpenseForm onCreate={onCreate} />);

    await user.type(screen.getByLabelText("Amount (INR)"), "120");
    await user.selectOptions(screen.getByLabelText("Category"), "Travel");
    await user.type(screen.getByLabelText("Transaction Date"), "2026-05-01");
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Amount (INR)")).toHaveValue("");
    });
    expect(screen.getByLabelText("Category")).toHaveValue("");
  });

  it("surfaces the error when the API rejects the category", async () => {
    const user = userEvent.setup();
    const onCreate = vi
      .fn()
      .mockRejectedValue(new Error('Unsupported category "Friends".'));

    render(<ExpenseForm onCreate={onCreate} />);

    await user.type(screen.getByLabelText("Amount (INR)"), "120");
    await user.selectOptions(screen.getByLabelText("Category"), "Travel");
    await user.type(screen.getByLabelText("Transaction Date"), "2026-05-01");
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    await waitFor(() => {
      expect(
        screen.getByText('Unsupported category "Friends".')
      ).toBeInTheDocument();
    });
  });
});