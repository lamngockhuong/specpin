// SSE subscription over the sidecar's /events stream. MV3 service workers lack
// EventSource (and EventSource cannot send the Authorization header anyway), so
// this uses a fetch-stream reader with reconnect + exponential backoff.

export type ConnectionState = "connecting" | "open" | "error" | "closed";

export interface SubscribeOptions {
  fetch?: typeof fetch;
  onState?: (state: ConnectionState) => void;
  /** Initial reconnect delay; doubles each failure up to maxBackoffMs. */
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Parse one SSE frame and fire onChange when it is a `change` event. */
function handleFrame(frame: string, onChange: () => void): void {
  let event = "message";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
  }
  if (event === "change") onChange();
}

async function readStream(body: ReadableStream<Uint8Array>, onChange: () => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf("\n\n");
    while (idx !== -1) {
      handleFrame(buffer.slice(0, idx), onChange);
      buffer = buffer.slice(idx + 2);
      idx = buffer.indexOf("\n\n");
    }
  }
}

/**
 * Subscribe to sidecar change events. Returns an unsubscribe function. The
 * connection auto-reconnects with backoff until unsubscribed.
 */
export function subscribeEvents(
  baseUrl: string,
  token: string,
  onChange: () => void,
  options: SubscribeOptions = {},
): () => void {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const base = options.baseBackoffMs ?? 500;
  const max = options.maxBackoffMs ?? 10_000;
  const setState = (s: ConnectionState) => options.onState?.(s);

  // A connection must stay up at least this long to count as healthy and reset
  // the backoff; otherwise an accept-then-immediately-close server would have us
  // reconnect at the base interval forever.
  const STABLE_MS = 5_000;
  const controller = new AbortController();
  let closed = false;
  let backoff = base;

  const stop = () => {
    if (closed) return;
    closed = true;
    controller.abort();
    setState("closed");
  };

  void (async () => {
    while (!closed) {
      setState("connecting");
      const startedAt = Date.now();
      try {
        const res = await fetchImpl(`${baseUrl}/events`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`events HTTP ${res.status}`);
        setState("open");
        await readStream(res.body, onChange);
        if (Date.now() - startedAt >= STABLE_MS) backoff = base; // healthy session
      } catch {
        if (closed) return;
        setState("error");
      }
      if (closed) return;
      await delay(backoff);
      backoff = Math.min(backoff * 2, max);
    }
  })();

  return stop;
}
