import { Link } from "react-router-dom";
import { openDealCount, recentActivity, wonRevenue } from "../data.js";
import { styles } from "../styles.js";

// Landing screen after login: three stat cards, a recent-activity feed, and a CTA
// into the new-deal form. Each headline element carries a `data-spec-id` anchor.
export function Dashboard() {
  return (
    <>
      <h1 style={styles.h1}>Dashboard</h1>
      <p style={styles.lead}>Pipeline snapshot for this quarter.</p>

      <div style={styles.statGrid}>
        <div data-spec-id="dashboard-stat-revenue" style={styles.stat}>
          <div style={styles.statLabel}>Revenue (won)</div>
          <div style={styles.statValue}>${(wonRevenue / 1000).toLocaleString()}k</div>
        </div>
        <div data-spec-id="dashboard-stat-deals" style={styles.stat}>
          <div style={styles.statLabel}>Open deals</div>
          <div style={styles.statValue}>{openDealCount}</div>
        </div>
        <div data-spec-id="dashboard-stat-tasks" style={styles.stat}>
          <div style={styles.statLabel}>Tasks due</div>
          <div style={styles.statValue}>3</div>
        </div>
      </div>

      <h2 style={styles.h2}>Recent activity</h2>
      <ul data-spec-id="dashboard-activity" style={styles.feed}>
        {recentActivity.map((item) => (
          <li key={item} style={styles.feedItem}>
            {item}
          </li>
        ))}
      </ul>

      <p style={{ marginTop: 20 }}>
        <Link data-spec-id="dashboard-new-deal-cta" to="/deals/new" style={styles.button}>
          + New deal
        </Link>
      </p>
    </>
  );
}
