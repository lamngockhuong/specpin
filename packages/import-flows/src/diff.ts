// diff.ts — minimal line-level diff for --dry-run/--check: shows what would
// change without a new dependency. flows.json/screens.json are small/medium
// files (hand + import authored), so an LCS-based line diff is plenty — no
// need for a hunk-windowed unified-diff library.

export interface FileDiff {
  /** True when `next` differs from `current` at all. */
  changed: boolean;
  /** Diff text: " " unchanged, "-" only in current, "+" only in next.
   * Empty string when unchanged. */
  text: string;
}

type DiffOp = { kind: "same" | "add" | "del"; line: string };

/** Line diff between `current` and `next`, labeled `label` in the header.
 * Uses an LCS dynamic program (O(n*m) in line count) — fine at the file
 * sizes this CLI ever sees. */
export function diffText(label: string, current: string, next: string): FileDiff {
  if (current === next) return { changed: false, text: "" };

  const a = current.length > 0 ? current.split("\n") : [];
  const b = next.length > 0 ? next.split("\n") : [];
  const ops = lcsDiff(a, b);
  const body = ops
    .map((op) => `${op.kind === "same" ? " " : op.kind === "del" ? "-" : "+"} ${op.line}`)
    .join("\n");

  return {
    changed: true,
    text: `--- ${label} (current)\n+++ ${label} (imported)\n${body}\n`,
  };
}

/** Safe line access: only ever called with `i` inside the loop's own bound
 * (`i < lines.length`), so the `?? ""` fallback is never actually taken — it
 * exists to satisfy `noUncheckedIndexedAccess` without a non-null assertion. */
function lineAt(lines: readonly string[], i: number): string {
  return lines[i] ?? "";
}

/** Same rationale as `lineAt`: `i`/`j` are always within `dp`'s allocated
 * bounds (`[0, n] x [0, m]`) at every call site. */
function dpAt(dp: readonly number[][], i: number, j: number): number {
  return dp[i]?.[j] ?? 0;
}

function dpSet(dp: number[][], i: number, j: number, value: number): void {
  const row = dp[i];
  if (row !== undefined) row[j] = value;
}

function lcsDiff(a: readonly string[], b: readonly string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = length of the LCS of a[i:] and b[j:].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const value =
        lineAt(a, i) === lineAt(b, j)
          ? dpAt(dp, i + 1, j + 1) + 1
          : Math.max(dpAt(dp, i + 1, j), dpAt(dp, i, j + 1));
      dpSet(dp, i, j, value);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (lineAt(a, i) === lineAt(b, j)) {
      ops.push({ kind: "same", line: lineAt(a, i) });
      i++;
      j++;
    } else if (dpAt(dp, i + 1, j) >= dpAt(dp, i, j + 1)) {
      ops.push({ kind: "del", line: lineAt(a, i) });
      i++;
    } else {
      ops.push({ kind: "add", line: lineAt(b, j) });
      j++;
    }
  }
  while (i < n) {
    ops.push({ kind: "del", line: lineAt(a, i) });
    i++;
  }
  while (j < m) {
    ops.push({ kind: "add", line: lineAt(b, j) });
    j++;
  }
  return ops;
}
