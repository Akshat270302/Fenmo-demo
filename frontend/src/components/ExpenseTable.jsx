const ExpenseTable = ({
  expenses,
  loading,
  title = "Recent Transactions",
  subtitle = "Review your latest expenses categorized.",
  showCreatedAt = false,
  compact = false,
}) => {
  return (
    <section className="card">
      {!compact ? (
        <div className="table-header">
          <div>
            <h2 className="card-title">{title}</h2>
            <p className="muted">{subtitle}</p>
          </div>
        </div>
      ) : null}
      {loading ? (
        <p className="muted">Loading expenses...</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Amount</th>
                <th>Category</th>
                <th>Description</th>
                <th>Date</th>
                {showCreatedAt ? <th>Created At</th> : null}
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={showCreatedAt ? 5 : 4} className="muted">
                    No expenses found.
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="amount">₹{expense.amount}</td>
                    <td>
                      <span className="pill">{expense.category}</span>
                    </td>
                    <td>{expense.description || "-"}</td>
                    <td>{expense.date}</td>
                    {showCreatedAt ? (
                      <td>{expense.created_at?.slice(0, 10) || "-"}</td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default ExpenseTable;
