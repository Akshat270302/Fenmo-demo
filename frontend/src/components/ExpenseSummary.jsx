const ExpenseSummary = ({ categories, total, selected, onChange }) => {
  return (
    <section className="card card-row">
      <div>
        <p className="label">Quick Filter</p>
        <select
          className="select"
          value={selected}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <div className="total-card">
        <span className="label">Aggregated total spend</span>
        <span className="total-value">₹{total}</span>
      </div>
    </section>
  );
};

export default ExpenseSummary;
