/** Trigger a browser download of a Blob under `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has grabbed the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Download a UTF-8 text string as a file. */
export function downloadText(text: string, filename: string, mime: string): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

/** Swap a file's extension (e.g. "shot.png" + "json" → "shot.json"). */
export function withExtension(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base}.${ext}`;
}
