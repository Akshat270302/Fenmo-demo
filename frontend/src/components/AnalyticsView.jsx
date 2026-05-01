import { useMemo, useState } from "react";

const AnalyticsView = ({ expenses, categories }) => {
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateRange, setDateRange] = useState("last30");

  const filteredByCategory = useMemo(() => {
    if (!categoryFilter) {
      return expenses;
    }
    return expenses.filter((expense) => expense.category === categoryFilter);
  }, [expenses, categoryFilter]);

  const filteredByDate = useMemo(() => {
    if (dateRange === "all") {
      return filteredByCategory;
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
    let start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    );

    if (dateRange === "last7") {
      start.setDate(start.getDate() - 6);
    } else if (dateRange === "last30") {
      start.setDate(start.getDate() - 29);
    } else if (dateRange === "last90") {
      start.setDate(start.getDate() - 89);
    } else if (dateRange === "thisMonth") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (dateRange === "lastMonth") {
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
      start = lastMonthStart;
      return filteredByCategory.filter((expense) => {
        if (!expense.date) {
          return false;
        }
        const expenseDate = new Date(`${expense.date}T00:00:00`);
        if (Number.isNaN(expenseDate.getTime())) {
          return false;
        }
        return expenseDate >= lastMonthStart && expenseDate <= lastMonthEnd;
      });
    }

    return filteredByCategory.filter((expense) => {
      if (!expense.date) {
        return false;
      }
      const expenseDate = new Date(`${expense.date}T00:00:00`);
      if (Number.isNaN(expenseDate.getTime())) {
        return false;
      }
      return expenseDate >= start && expenseDate <= end;
    });
  }, [dateRange, filteredByCategory]);

  const total = useMemo(() => {
    const sum = filteredByDate.reduce((acc, expense) => {
      const amount = Number.parseFloat(expense.amount);
      if (Number.isNaN(amount)) {
        return acc;
      }
      return acc + amount;
    }, 0);
    return sum.toFixed(2);
  }, [filteredByDate]);

  const dayCount = useMemo(() => {
    if (dateRange === "all") {
      const uniqueDates = new Set(filteredByDate.map((expense) => expense.date));
      return Math.max(uniqueDates.size, 1);
    }

    const now = new Date();
    let start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let end = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (dateRange === "last7") {
      start.setDate(start.getDate() - 6);
    } else if (dateRange === "last30") {
      start.setDate(start.getDate() - 29);
    } else if (dateRange === "last90") {
      start.setDate(start.getDate() - 89);
    } else if (dateRange === "thisMonth") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (dateRange === "lastMonth") {
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    }

    const ms = end.getTime() - start.getTime();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(days, 1);
  }, [dateRange, filteredByDate]);

  const averageDaily = useMemo(() => {
    const sum = Number.parseFloat(total);
    if (Number.isNaN(sum)) {
      return "0.00";
    }
    return (sum / dayCount).toFixed(2);
  }, [total, dayCount]);

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
      .slice(0, 5);

    const totalAmount = entries.reduce((sum, item) => sum + item.amount, 0);
    return entries.map((item) => ({
      ...item,
      percent: totalAmount ? Math.round((item.amount / totalAmount) * 100) : 0,
    }));
  }, [filteredByDate]);

  const breakdown = useMemo(() => {
    return topCategories.slice(0, 4);
  }, [topCategories]);

  const recentActivity = useMemo(() => {
    return [...filteredByDate]
      .sort((a, b) => {
        const dateDiff = b.date.localeCompare(a.date);
        if (dateDiff !== 0) {
          return dateDiff;
        }
        return (b.created_at || "").localeCompare(a.created_at || "");
      })
      .slice(0, 3);
  }, [filteredByDate]);

  return (
    <div className="analytics">
      <header className="analytics-header">
        <div>
          <h1>Analytics Overview</h1>
          <p className="muted">Detailed insights into your spending patterns.</p>
        </div>
        <div className="analytics-controls">
          <select
            className="select"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
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
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="last90">Last 90 Days</option>
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </header>

      <div className="analytics-grid">
        <section className="card metric-card">
          <p className="label">Total Expenses</p>
          <div className="metric-value">₹{total}</div>
          <p className="muted">Calculated from your logged transactions</p>
        </section>

        <section className="card metric-card">
          <p className="label">Average Daily Spend</p>
          <div className="metric-value">₹{averageDaily}</div>
          <p className="muted">Based on {dayCount} days in range</p>
        </section>

        <section className="card category-card">
          <h3>Top Categories</h3>
          {topCategories.length === 0 ? (
            <p className="muted">No category data yet.</p>
          ) : (
            topCategories.map((item) => (
              <div className="category-row" key={item.category}>
                <div className="category-name">{item.category}</div>
                <div className="category-bar">
                  <span style={{ width: `${item.percent}%` }} />
                </div>
                <span className="category-percent">
                  ₹{item.amount.toFixed(2)} ({item.percent}%)
                </span>
              </div>
            ))
          )}
        </section>

        <section className="card breakdown-card">
          <h3>Category Breakdown</h3>
          <p className="muted">Relative spend weight across categories</p>
          {breakdown.length === 0 ? (
            <p className="muted">No breakdown data available.</p>
          ) : (
            breakdown.map((item) => (
              <div className="breakdown-row" key={item.category}>
                <span>{item.category}</span>
                <div className="breakdown-bar">
                  <span style={{ width: `${item.percent}%` }} />
                </div>
              </div>
            ))
          )}
        </section>

        <section className="card activity-card">
          <div className="activity-header">
            <h3>Recent Activity</h3>
          </div>
          {recentActivity.length === 0 ? (
            <p className="muted">No recent activity.</p>
          ) : (
            recentActivity.map((item) => (
              <div className="activity-item" key={item.id}>
                <div>
                  <p>{item.description || item.category}</p>
                  <span className="muted">{item.date}</span>
                </div>
                <span>₹{item.amount}</span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
};

export default AnalyticsView;
