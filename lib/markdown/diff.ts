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

/** A footnote label that changed between the two sides of a line. */
export type FootnoteRelabel = { from: string; to: string };

/** A removed + added line that differ only in footnote labels. */
export type FootnoteRenumberRow = {
  type: "renumber";
  before: string;
  after: string;
  labels: FootnoteRelabel[];
};

export type DiffRow = DiffLine | FootnoteRenumberRow;

/** "[^67] → [^76]" (first few) for a folded footnote renumber. */
export function relabelSummary(labels: FootnoteRelabel[]): string {
  const shown = labels
    .slice(0, 3)
    .map(({ from, to }) => `[^${from}] → [^${to}]`)
    .join(", ");
  return labels.length > 3 ? `${shown}, …` : shown;
}

const FOOTNOTE_LABEL = /\[\^([^\]\s]+)\]/g;

/**
 * The relabelled footnotes when `before` and `after` are the same text apart
 * from `[^label]` references (or a `[^label]:` definition), else null.
 */
export function footnoteRelabels(
  before: string,
  after: string
): FootnoteRelabel[] | null {
  if (before === after) return null;
  const strip = (text: string) => text.replace(FOOTNOTE_LABEL, "[^]");
  if (strip(before) !== strip(after)) return null;
  const from = [...before.matchAll(FOOTNOTE_LABEL)].map((m) => m[1]);
  const to = [...after.matchAll(FOOTNOTE_LABEL)].map((m) => m[1]);
  const labels: FootnoteRelabel[] = [];
  from.forEach((label, index) => {
    if (label !== to[index]) labels.push({ from: label, to: to[index] });
  });
  return labels.length > 0 ? labels : null;
}

/**
 * Pairs each removed line with a later added line of the same change run
 * when the two differ only in footnote numbers (a renumber, not an edit),
 * so views can fold that pair into one row. Nothing else is touched.
 */
export function groupFootnoteRenumbers(lines: DiffLine[]): DiffRow[] {
  const out: DiffRow[] = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index].type === "context") {
      out.push(lines[index]);
      index += 1;
      continue;
    }
    let end = index;
    while (end < lines.length && lines[end].type !== "context") end += 1;
    const run = lines.slice(index, end);
    const pairs = new Map<number, { add: number; labels: FootnoteRelabel[] }>();
    const used = new Set<number>();
    let after = 0;
    run.forEach((line, i) => {
      if (line.type !== "remove") return;
      for (let j = Math.max(after, i + 1); j < run.length; j += 1) {
        if (run[j].type !== "add" || used.has(j)) continue;
        const labels = footnoteRelabels(line.text, run[j].text);
        if (!labels) continue;
        pairs.set(i, { add: j, labels });
        used.add(j);
        after = j + 1;
        break;
      }
    });
    run.forEach((line, i) => {
      if (used.has(i)) return;
      const pair = pairs.get(i);
      out.push(
        pair
          ? {
              type: "renumber",
              before: line.text,
              after: run[pair.add].text,
              labels: pair.labels,
            }
          : line
      );
    });
    index = end;
  }
  return out;
}
