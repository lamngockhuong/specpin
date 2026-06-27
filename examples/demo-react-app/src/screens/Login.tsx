import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth.js";
import { styles } from "../styles.js";

// Login screen. Inputs and the submit button carry stable `data-spec-id` anchors
// that the seeded .specs/login.spec.json pins specs to.
export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  return (
    <main style={{ ...styles.page, ...styles.narrow }}>
      <h1 style={styles.h1}>Acme CRM</h1>
      <p style={styles.lead}>
        A demo UI for Specpin. Elements across these screens carry <code>data-spec-id</code>{" "}
        anchors.
      </p>

      <form
        className="login"
        style={styles.card}
        onSubmit={(e) => {
          e.preventDefault();
          login(email);
          navigate("/dashboard");
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
