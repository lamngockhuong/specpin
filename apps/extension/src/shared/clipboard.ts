/** Write text to the clipboard, returning whether it succeeded. Swallows the
 *  rejection the browser throws when the clipboard is blocked (insecure context
 *  or denied permission) so callers fall back (e.g. leave a snippet visible for a
 *  manual copy) rather than surfacing an error. The one place this guard lives,
 *  shared by the capture-form weak-anchor hint and the fragile-scan Copy button. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
