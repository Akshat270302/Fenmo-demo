import { useCallback, useEffect, useMemo, useState } from "react";
import ExpenseForm from "./components/ExpenseForm.jsx";
import ExpenseSummary from "./components/ExpenseSummary.jsx";
import ExpenseTable from "./components/ExpenseTable.jsx";
import { createExpense, getExpenses } from "./api/expenses.js";

const App = () => {
  const [expenses, setExpenses] = useState([]);
  const [total, setTotal] = useState("0.00");
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeView, setActiveView] = useState("dashboard");
  const [dateRange, setDateRange] = useState("all");

  const refreshCategories = useCallback(async () => {
    const data = await getExpenses();
    const unique = Array.from(
      new Set(data.expenses.map((expense) => expense.category))
    );
    setCategories(unique);
    return data;
  }, []);

  const loadExpenses = useCallback(
    async (category) => {
      setLoading(true);
      setErrorMessage("");
      try {
        const data = category
          ? await getExpenses(category)
          : await getExpenses();
        setExpenses(data.expenses);
        setTotal(data.total);
      } catch (err) {
        setErrorMessage(err.message || "Failed to load expenses");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        const data = await refreshCategories();
        setExpenses(data.expenses);
        setTotal(data.total);
      } catch (err) {
        setErrorMessage(err.message || "Failed to load expenses");
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, [refreshCategories]);

  const handleCreate = async (payload) => {
    setSubmitting(true);
    setErrorMessage("");
    const idempotencyKey = crypto.randomUUID();
    try {
      await createExpense(payload, idempotencyKey);
      await refreshCategories();
      await loadExpenses(selectedCategory || "");
    } catch (err) {
      setErrorMessage(err.message || "Failed to create expense");
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleFilterChange = async (value) => {
    setSelectedCategory(value);
    await loadExpenses(value || "");
  };

  const summaryCategories = useMemo(() => categories, [categories]);
  const visibleExpenses = useMemo(() => {
    if (!searchTerm.trim()) {
      return expenses;
    }

    const needle = searchTerm.trim().toLowerCase();
    return expenses.filter((expense) => {
      const category = expense.category ? expense.category.toLowerCase() : "";
      const description = expense.description
        ? expense.description.toLowerCase()
        : "";
      return category.includes(needle) || description.includes(needle);
    });
  }, [expenses, searchTerm]);

  const filteredByDate = useMemo(() => {
    if (dateRange === "all") {
      return visibleExpenses;
    }

    const now = new Date();
    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    );
    let start;

    if (dateRange === "last7") {
      start = new Date(end);
      start.setDate(end.getDate() - 6);
    } else if (dateRange === "last30") {
      start = new Date(end);
      start.setDate(end.getDate() - 29);
    } else if (dateRange === "last90") {
      start = new Date(end);
      start.setDate(end.getDate() - 89);
    } else if (dateRange === "thisMonth") {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    } else if (dateRange === "lastMonth") {
      const lastMonthEnd = new Date(
        end.getFullYear(),
        end.getMonth(),
        0,
        23,
        59,
        59,
        999
      );
      start = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
      return visibleExpenses.filter((expense) => {
        if (!expense.date) {
          return false;
        }
        const expenseDate = new Date(`${expense.date}T00:00:00`);
        if (Number.isNaN(expenseDate.getTime())) {
          return false;
        }
        return expenseDate >= start && expenseDate <= lastMonthEnd;
      });
    }

    return visibleExpenses.filter((expense) => {
      if (!expense.date) {
        return false;
      }
      const expenseDate = new Date(`${expense.date}T00:00:00`);
      if (Number.isNaN(expenseDate.getTime())) {
        return false;
      }
      return expenseDate >= start && expenseDate <= end;
    });
  }, [dateRange, visibleExpenses]);

  const visibleTotal = useMemo(() => {
    const sum = visibleExpenses.reduce((acc, expense) => {
      const amount = Number.parseFloat(expense.amount);
      if (Number.isNaN(amount)) {
        return acc;
      }
      return acc + amount;
    }, 0);
    return sum.toFixed(2);
  }, [visibleExpenses]);

  const rangeTotal = useMemo(() => {
    const sum = filteredByDate.reduce((acc, expense) => {
      const amount = Number.parseFloat(expense.amount);
      if (Number.isNaN(amount)) {
        return acc;
      }
      return acc + amount;
    }, 0);
    return sum.toFixed(2);
  }, [filteredByDate]);

  const topCategories = useMemo(() => {
    const totals = filteredByDate.reduce((acc, expense) => {
      const category = expense.category || "Other";
      const amount = Number.parseFloat(expense.amount);
      if (!Number.isNaN(amount)) {
        acc[category] = (acc[category] || 0) + amount;
      }
      return acc;
    }, {});

    const entries = Object.entries(totals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);

    const totalAmount = entries.reduce((sum, item) => sum + item.amount, 0);
    return entries.map((item) => ({
      ...item,
      percent: totalAmount ? Math.round((item.amount / totalAmount) * 100) : 0,
    }));
  }, [filteredByDate]);

  const renderDashboard = () => (
    <>
      <header className="content-header">
        <h1>Dashboard</h1>
        <p className="muted">
          Record expenses, filter by category, and track your totals.
        </p>
      </header>

      {errorMessage ? <p className="error banner">{errorMessage}</p> : null}

      <div className="stack">
        <ExpenseForm onCreate={handleCreate} submitting={submitting} />
        <ExpenseSummary
          categories={summaryCategories}
          total={visibleTotal}
          selected={selectedCategory}
          onChange={handleFilterChange}
        />
        <ExpenseTable
          expenses={visibleExpenses}
          loading={loading}
          title="Recent Transactions"
          subtitle="Review your latest expenses categorized."
        />
      </div>
    </>
  );

  const renderTransactions = () => (
    <>
      <div className="top-bar">
        <h1>Expense Tracker</h1>
        <div className="profile-dot" />
      </div>

      <div className="page-title">
        <div>
          <h2>Transactions</h2>
          <div className="tabs">
            <button className="tab" type="button">
              Overview
            </button>
            <button className="tab active" type="button">
              History
            </button>
          </div>
        </div>
      </div>

      {errorMessage ? <p className="error banner">{errorMessage}</p> : null}

      <div className="transactions-layout">
        <div className="transactions-main">
          <section className="card filter-card">
            <div className="filter-row">
              <div className="filter-input">
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <select
                className="select"
                value={selectedCategory}
                onChange={(event) => handleFilterChange(event.target.value)}
              >
                <option value="">All categories</option>
                {summaryCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={dateRange}
                onChange={(event) => setDateRange(event.target.value)}
              >
                <option value="all">All time</option>
                <option value="last7">Last 7 days</option>
                <option value="last30">Last 30 days</option>
                <option value="last90">Last 90 days</option>
                <option value="thisMonth">This month</option>
                <option value="lastMonth">Last month</option>
              </select>
            </div>
          </section>

          <section className="card">
            <div className="table-actions">
              <div>
                <div className="table-title">
                  <h3>Expense Records</h3>
                  <span className="count-pill">
                    {filteredByDate.length} total
                  </span>
                </div>
              </div>
            </div>
            <ExpenseTable
              expenses={filteredByDate}
              loading={loading}
              showCreatedAt
              compact
            />
            <div className="table-footer muted">
              Showing latest transactions from current billing cycle. Amounts
              include applicable taxes.
            </div>
          </section>
        </div>

        <aside className="transactions-side">
          <section className="card side-card">
            <p className="label">Filtered total</p>
            <div className="total-hero">
              <span className="total-value">₹{rangeTotal}</span>
              <span className="badge positive">+12.5% from last month</span>
            </div>
          </section>

          <section className="card side-card">
            <p className="label">Top categories</p>
            <div className="category-list">
              {topCategories.length === 0 ? (
                <p className="muted">No category data yet.</p>
              ) : (
                topCategories.map((item) => (
                  <div className="category-row" key={item.category}>
                    <div className="category-name">{item.category}</div>
                    <div className="category-bar">
                      <span style={{ width: `${item.percent}%` }} />
                    </div>
                    <span className="category-percent">{item.percent}%</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span className="brand-name">SmartSpend</span>
        </div>
        <nav className="nav">
          <button
            className={`nav-item ${activeView === "dashboard" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`nav-item ${
              activeView === "transactions" ? "active" : ""
            }`}
            type="button"
            onClick={() => setActiveView("transactions")}
          >
            Transactions
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="avatar">AM</div>
            <div>
              <p className="user-name">Arjun Mehta</p>
              <span className="muted">Premium plan</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="content">
        {activeView === "transactions" ? renderTransactions() : renderDashboard()}
      </main>
    </div>
  );
};

export default App;
