// CSP-safe binary download for the generated export zip. MV3's default CSP permits
// blob: object URLs, so a Blob + object URL + programmatic <a download> click is
// the dependency-free way to save bytes from an extension page. Errors are thrown
// (not swallowed) so the caller can surface a visible failure.

/** Trigger a browser download of `bytes` as `name`. */
export function downloadBytes(name: string, bytes: Uint8Array, type: string): void {
  // Cast: TS types Blob parts as requiring an ArrayBuffer-backed view, but a
  // Uint8Array (ArrayBufferLike) is a valid BlobPart at runtime.
  const blob = new Blob([bytes as unknown as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    throw new Error(`download failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    // Revoke after a tick so the download has a chance to start.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Download a zip archive (application/zip). */
export function downloadZip(name: string, bytes: Uint8Array): void {
  downloadBytes(name, bytes, "application/zip");
}
