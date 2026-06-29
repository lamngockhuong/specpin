// Pure textarea-selection helpers for the capture form's Markdown toolbar. Each
// takes the current value + selection and returns the new value plus where the
// selection should land, so the DOM glue stays a thin write-back + reselect.
// Kept pure (no DOM) to mirror buildSpec/mergeLocalized and to unit-test without
// jsdom. The emitted syntax is exactly the subset the Phase 1 renderer accepts:
// **bold**, _italic_, [text](url), "- " bullets, "N. " numbered lists.

/** The result of a toolbar edit: the new textarea value and the selection range
 *  to restore (caret when selStart === selEnd). */
export interface SelectionEdit {
  value: string;
  selStart: number;
  selEnd: number;
}

/** Wrap the selection in `marker` (e.g. "**" or "_"), or remove the marker when
 *  the selection is already wrapped (toggle). With an empty selection it inserts
 *  the marker pair and drops the caret between them so the user types inside. */
export function toggleWrap(
  value: string,
  start: number,
  end: number,
  marker: string,
): SelectionEdit {
  const before = value.slice(0, start);
  const sel = value.slice(start, end);
  const after = value.slice(end);
  const m = marker.length;

  // Markers sit just outside the selection -> unwrap them.
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return {
      value: before.slice(0, -m) + sel + after.slice(m),
      selStart: start - m,
      selEnd: end - m,
    };
  }
  // The selection itself includes the markers -> unwrap from inside.
  if (sel.length >= 2 * m && sel.startsWith(marker) && sel.endsWith(marker)) {
    const inner = sel.slice(m, sel.length - m);
    return { value: before + inner + after, selStart: start, selEnd: start + inner.length };
  }
  // Otherwise wrap; the selection (or caret) moves inside the markers.
  return {
    value: `${before}${marker}${sel}${marker}${after}`,
    selStart: start + m,
    selEnd: end + m,
  };
}

/** Insert a `[text](url)` link. The selection becomes the link text (or a "text"
 *  placeholder when empty); the returned selection covers the text label so the
 *  user can overtype it immediately. */
export function insertLink(value: string, start: number, end: number, url: string): SelectionEdit {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const text = value.slice(start, end) || "text";
  const href = url || "url";
  const link = `[${text}](${href})`;
  const selStart = before.length + 1; // just after "["
  return { value: before + link + after, selStart, selEnd: selStart + text.length };
}

/** Prefix every line touched by the selection with a list marker. "bullet" emits
 *  "- "; "number" emits "1. ", "2. "… by line order. Expands to whole lines so a
 *  partial selection still marks the lines it spans. */
export function prefixLines(
  value: string,
  start: number,
  end: number,
  kind: "bullet" | "number",
): SelectionEdit {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = value.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = value.length;

  const block = value.slice(lineStart, lineEnd);
  const prefixed = block
    .split("\n")
    .map((line, i) => (kind === "bullet" ? `- ${line}` : `${i + 1}. ${line}`))
    .join("\n");

  const before = value.slice(0, lineStart);
  const after = value.slice(lineEnd);
  return {
    value: before + prefixed + after,
    selStart: lineStart,
    selEnd: lineStart + prefixed.length,
  };
}
