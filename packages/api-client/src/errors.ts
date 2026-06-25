/**
 * Typed error for every non-2xx sidecar response (and network failures). Carries
 * the HTTP status, a machine code (the sidecar's `error` field), and the schema
 * validation `details` passed through from 400 responses.
 */
export class SidecarError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];

  constructor(status: number, code: string, details: string[] = [], message?: string) {
    super(message ?? `sidecar error ${code} (HTTP ${status})`);
    this.name = "SidecarError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the failure is an auth problem the UI should surface as "Reconnect". */
  get isAuthError(): boolean {
    return this.status === 401;
  }
}
