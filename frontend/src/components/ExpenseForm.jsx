import { useState } from "react";

const initialState = {
  amount: "",
  category: "",
  description: "",
  date: "",
};

const ExpenseForm = ({ onCreate, submitting }) => {
  const [formValues, setFormValues] = useState(initialState);
  const [customCategory, setCustomCategory] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    const isOther = formValues.category === "Other";
    const resolvedCategory = isOther ? customCategory.trim() : formValues.category;

    if (isOther && !resolvedCategory) {
      setErrorMessage("Please enter a custom category.");
      return;
    }

    try {
      await onCreate({
        amount: formValues.amount,
        category: resolvedCategory,
        description: formValues.description,
        date: formValues.date,
      });
      setFormValues(initialState);
      setCustomCategory("");
    } catch (err) {
      setErrorMessage(err.message || "Failed to create expense");
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <div className="card-title-row">
            <span className="icon-circle">+</span>
            <h2 className="card-title">Add New Expense</h2>
          </div>
          <p className="muted">
            Record a new transaction to track your spending habits.
          </p>
        </div>
      </div>
      <form className="form form-wide" onSubmit={handleSubmit}>
        <label className="field">
          Amount (INR)
          <input
            name="amount"
            type="text"
            placeholder="0.00"
            value={formValues.amount}
            onChange={handleChange}
            required
          />
        </label>
        <label className="field">
          Category
          <select
            name="category"
            className="select"
            value={formValues.category}
            onChange={handleChange}
            required
          >
            <option value="">Select category</option>
            <option value="Food & Dining">Food & Dining</option>
            <option value="Travel">Travel</option>
            <option value="Bills">Bills</option>
            <option value="Health">Health</option>
            <option value="Entertainment">Entertainment</option>
            <option value="Other">Other</option>
          </select>
        </label>
        {formValues.category === "Other" ? (
          <label className="field">
            Custom category
            <input
              name="customCategory"
              type="text"
              placeholder="Enter category"
              value={customCategory}
              onChange={(event) => setCustomCategory(event.target.value)}
              required
            />
          </label>
        ) : null}
        <label className="field span-2">
          Description
          <input
            name="description"
            type="text"
            placeholder="What was this expense for?"
            value={formValues.description}
            onChange={handleChange}
          />
        </label>
        <label className="field">
          Transaction Date
          <input
            name="date"
            type="date"
            value={formValues.date}
            onChange={handleChange}
            required
          />
        </label>
        <div className="form-actions">
          <button className="button primary" type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Add Expense"}
          </button>
        </div>
      </form>
      {errorMessage ? <p className="error">{errorMessage}</p> : null}
    </section>
  );
};

export default ExpenseForm;
