import { useState } from "react";

// Demo UI with stable `data-spec-id` anchors on the elements that the seeded
// .specs/ files pin specs to. With the sidecar running and the extension
// connected, Specpin renders those specs on these elements.
export function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main style={styles.page}>
      <h1>Acme CRM</h1>
      <p style={styles.lead}>
        A demo UI for Specpin. The login button and inputs carry <code>data-spec-id</code> anchors.
      </p>

      <form
        className="login"
        style={styles.card}
        onSubmit={(e) => {
          e.preventDefault();
          alert(`Pretend login for ${email || "(empty)"}`);
        }}
      >
        <label style={styles.label}>
          Email
          <input
            data-spec-id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />
        </label>
        <label style={styles.label}>
          Password
          <input
            data-spec-id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
          />
        </label>
        <button data-spec-id="login-submit" type="submit" style={styles.button}>
          Log in
        </button>
        <a data-spec-id="forgot-password" href="#reset" style={styles.link}>
          Forgot password?
        </a>
      </form>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 420,
    margin: "48px auto",
    fontFamily: "system-ui, sans-serif",
    color: "#1f2937",
  },
  lead: { color: "#6b7280" },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 20,
    border: "1px solid #e5e7eb",
    borderRadius: 10,
  },
  label: { display: "flex", flexDirection: "column", gap: 4, fontWeight: 600 },
  input: { padding: 8, border: "1px solid #d1d5db", borderRadius: 6, fontWeight: 400 },
  button: {
    padding: 10,
    border: "none",
    borderRadius: 6,
    background: "#4f46e5",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
  link: { color: "#4f46e5", fontSize: 13 },
};
