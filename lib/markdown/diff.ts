/**
 * Line-oriented unified diff (LCS) for review / history / GitHub views.
 * Not Myers: shared head and tail are trimmed first, and very large changed
 * middles fall back to remove + add so a long essay can't hang the tab.
 */

export type DiffLine = {
  type: "context" | "add" | "remove";
  text: string;
};

/** Past this many LCS cells, the changed middle is shown as remove + add. */
const MAX_LCS_CELLS = 4_000_000;

export function unifiedLineDiff(before: string, after: string): DiffLine[] {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");

  // Shared head / tail never need the LCS table (most edits are local).
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start += 1;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const lines: DiffLine[] = [];
  for (let k = 0; k < start; k += 1) lines.push({ type: "context", text: a[k] });

  const n = endA - start;
  const m = endB - start;
  if (n * m > MAX_LCS_CELLS) {
    for (let k = start; k < endA; k += 1) lines.push({ type: "remove", text: a[k] });
    for (let k = start; k < endB; k += 1) lines.push({ type: "add", text: b[k] });
  } else {
    // Flat typed array: far lighter than number[][] for long essays.
    const width = m + 1;
    const dp = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[i * width + j] =
          a[start + i] === b[start + j]
            ? dp[(i + 1) * width + j + 1] + 1
            : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[start + i] === b[start + j]) {
        lines.push({ type: "context", text: a[start + i] });
        i += 1;
        j += 1;
      } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
        lines.push({ type: "remove", text: a[start + i] });
        i += 1;
      } else {
        lines.push({ type: "add", text: b[start + j] });
        j += 1;
      }
    }
    while (i < n) lines.push({ type: "remove", text: a[start + i++] });
    while (j < m) lines.push({ type: "add", text: b[start + j++] });
  }

  for (let k = endA; k < a.length; k += 1) lines.push({ type: "context", text: a[k] });
  return lines;
}

/** Collapse pure-context runs so the panel stays readable. */
export function compactDiff(lines: DiffLine[], context = 2): DiffLine[] {
  const keep = new Set<number>();
  lines.forEach((line, index) => {
    if (line.type === "context") return;
    for (
      let k = Math.max(0, index - context);
      k <= Math.min(lines.length - 1, index + context);
      k += 1
    ) {
      keep.add(k);
    }
  });

  const out: DiffLine[] = [];
  let last = -2;
  for (const index of [...keep].sort((x, y) => x - y)) {
    if (last !== -2 && index > last + 1) {
      out.push({ type: "context", text: "…" });
    }
    out.push(lines[index]);
    last = index;
  }
  return out;
}
