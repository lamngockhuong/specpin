import { Link, useNavigate, useParams } from "react-router-dom";
import { findCustomer } from "../data.js";
import { styles } from "../styles.js";

// Customer detail: contact info, deal history table, free-text notes, and a
// destructive delete action. Anchors sit on the spec-worthy elements.
export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const customer = findCustomer(id);

  if (!customer) {
    return (
      <>
        <h1 style={styles.h1}>Customer not found</h1>
        <Link to="/customers" style={styles.link}>
          Back to customers
        </Link>
      </>
    );
  }

  return (
    <>
      <p>
        <Link to="/customers" style={styles.link}>
          &larr; Customers
        </Link>
      </p>
      <h1 style={styles.h1}>{customer.name}</h1>
      <p style={styles.lead}>{customer.company}</p>

      <p>
        Email:{" "}
        <a data-spec-id="customer-email" href={`mailto:${customer.email}`} style={styles.link}>
          {customer.email}
        </a>
      </p>

      <h2 style={styles.h2}>Deal history</h2>
      <table data-spec-id="customer-deal-history" style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Deal</th>
            <th style={styles.th}>Amount</th>
            <th style={styles.th}>Stage</th>
          </tr>
        </thead>
        <tbody>
          {customer.deals.map((d) => (
            <tr key={d.id}>
              <td style={styles.td}>{d.name}</td>
              <td style={styles.td}>${d.amount.toLocaleString()}</td>
              <td style={styles.td}>{d.stage}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={styles.h2}>Notes</h2>
      <p data-spec-id="customer-notes" style={styles.card}>
        {customer.notes}
      </p>

      <div style={styles.dangerZone}>
        <button
          data-spec-id="customer-delete"
          type="button"
          style={styles.buttonDanger}
          onClick={() => {
            if (confirm(`Pretend: delete ${customer.name}?`)) navigate("/customers");
          }}
        >
          Delete customer
        </button>
      </div>
    </>
  );
}
