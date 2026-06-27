import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { dealStages, owners } from "../data.js";
import { styles } from "../styles.js";

// New-deal form with light client-side validation, demonstrating specs on
// business-rule-heavy inputs.
export function NewDeal() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<string>("Lead");
  const [owner, setOwner] = useState<string>("You");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!name.trim()) return setError("Deal name is required.");
    if (!Number.isFinite(value) || value <= 0) return setError("Amount must be a positive number.");
    setError("");
    alert(`Pretend: created "${name}" ($${value.toLocaleString()})`);
    navigate("/dashboard");
  }

  return (
    <>
      <h1 style={styles.h1}>New deal</h1>

      <form style={{ ...styles.card, maxWidth: 480 }} onSubmit={submit}>
        <label style={styles.label}>
          Deal name
          <input
            data-spec-id="deal-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          Amount (USD)
          <input
            data-spec-id="deal-amount"
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          Stage
          <select
            data-spec-id="deal-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            style={styles.select}
          >
            {dealStages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          Owner
          <select
            data-spec-id="deal-owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            style={styles.select}
          >
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        {error && <span style={styles.error}>{error}</span>}

        <button data-spec-id="deal-submit" type="submit" style={styles.button}>
          Create deal
        </button>
      </form>
    </>
  );
}
