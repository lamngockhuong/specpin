/**
 * Presentational sidecar-connection form: base URL + token fields and a
 * connect button. Connection state and the actual SidecarClient live in the
 * `use-sidecar` hook — this component only forwards the fields needed to
 * call `connect`, kept separate so `app.tsx` stays a thin composition root.
 */
import { type FormEvent, useState } from "react";

export interface SidecarPanelProps {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  onConnect: (baseUrl: string, token: string) => void;
}

export function SidecarPanel({ connected, connecting, error, onConnect }: SidecarPanelProps) {
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:4848");
  const [token, setToken] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onConnect(baseUrl, token);
  };

  return (
    <section className="sidecar-panel">
      <form onSubmit={submit}>
        <label>
          Sidecar URL
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://127.0.0.1:4848"
          />
        </label>
        <label>
          Token
          <input value={token} onChange={(e) => setToken(e.target.value)} type="password" />
        </label>
        <button type="submit" disabled={connecting}>
          {connected ? "Reconnect" : "Connect"}
        </button>
      </form>
      {error && <p className="sidecar-error">{error}</p>}
      {connected && <p className="sidecar-status">Connected — persisting to .specs/</p>}
      {!connected && !error && (
        <p className="sidecar-hint">
          Optional. Authoring and export work fully offline without this.
        </p>
      )}
    </section>
  );
}
