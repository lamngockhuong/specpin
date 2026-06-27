import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { customers } from "../data.js";
import { styles } from "../styles.js";

// Customers list: a search box, an add button, and a table whose rows link to the
// detail screen. Search filters by name/company client-side.
export function Customers() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.toLowerCase();
    return customers.filter((c) => `${c.name} ${c.company}`.toLowerCase().includes(needle));
  }, [query]);

  return (
    <>
      <h1 style={styles.h1}>Customers</h1>

      <div style={styles.toolbar}>
        <input
          data-spec-id="customers-search"
          type="search"
          placeholder="Search by name or company"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...styles.input, flex: 1 }}
        />
        <button
          data-spec-id="customers-add"
          type="button"
          style={styles.button}
          onClick={() => alert("Pretend: open new-customer form")}
        >
          + Add customer
        </button>
      </div>

      <table data-spec-id="customers-table" style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Company</th>
            <th style={styles.th}>Open deals</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <tr key={c.id}>
              <td style={styles.td}>
                <Link to={`/customers/${c.id}`} style={styles.link}>
                  {c.name}
                </Link>
              </td>
              <td style={styles.td}>{c.company}</td>
              <td style={styles.td}>{c.deals.length}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td style={styles.td} colSpan={3}>
                No customers match "{query}".
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
