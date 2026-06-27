import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth.js";
import { styles } from "../styles.js";

// Account settings: profile fields, a notifications toggle, save, and a danger zone
// that deletes the account (logs out in the demo).
export function Settings() {
  const { email, logout } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("Demo User");
  const [notifications, setNotifications] = useState(true);

  return (
    <>
      <h1 style={styles.h1}>Settings</h1>
      <p style={styles.lead}>Signed in as {email}</p>

      <form
        style={styles.card}
        onSubmit={(e) => {
          e.preventDefault();
          alert("Pretend: settings saved");
        }}
      >
        <label style={styles.label}>
          Display name
          <input
            data-spec-id="settings-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={styles.input}
          />
        </label>

        <div style={styles.toggleRow}>
          <span style={{ fontWeight: 600 }}>Email notifications</span>
          <label style={styles.inlineControl}>
            <input
              data-spec-id="settings-notifications"
              type="checkbox"
              checked={notifications}
              onChange={(e) => setNotifications(e.target.checked)}
            />
            {notifications ? "On" : "Off"}
          </label>
        </div>

        <button data-spec-id="settings-save" type="submit" style={styles.button}>
          Save changes
        </button>
      </form>

      <div style={styles.dangerZone}>
        <h2 style={{ ...styles.h2, marginTop: 0 }}>Danger zone</h2>
        <button
          data-spec-id="settings-delete-account"
          type="button"
          style={styles.buttonDanger}
          onClick={() => {
            if (confirm("Pretend: permanently delete your account?")) {
              logout();
              navigate("/login");
            }
          }}
        >
          Delete account
        </button>
      </div>
    </>
  );
}
