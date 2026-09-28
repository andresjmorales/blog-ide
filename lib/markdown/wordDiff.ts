/**
 * Word-level diff for reviewing AI edits. Essay paragraphs are single long
 * lines, so a line diff alone marks the whole paragraph as changed; this
 * highlights the words that actually moved.
 */
import { compactDiff, unifiedLineDiff } from "@/lib/markdown/diff";

export type WordSegment = {
  type: "same" | "add" | "remove";
  text: string;
};

export type ReviewRow =
  | { type: "context"; text: string }
  | { type: "change"; segments: WordSegment[] };

/** Past this token-grid size, fall back to whole remove + add. */
const MAX_GRID = 400_000;

function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

function push(out: WordSegment[], type: WordSegment["type"], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === type) last.text += text;
  else out.push({ type, text });
}

export function wordDiff(before: string, after: string): WordSegment[] {
  const a = tokenize(before);
  const b = tokenize(after);
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

  const out: WordSegment[] = [];
  push(out, "same", a.slice(0, start).join(""));

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  if (n * m > MAX_GRID) {
    push(out, "remove", midA.join(""));
    push(out, "add", midB.join(""));
  } else {
    const dp: Uint32Array[] = Array.from(
      { length: n + 1 },
      () => new Uint32Array(m + 1)
    );
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[i][j] =
          midA[i] === midB[j]
            ? dp[i + 1][j + 1] + 1
            : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        push(out, "same", midA[i]);
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        push(out, "remove", midA[i]);
        i += 1;
      } else {
        push(out, "add", midB[j]);
        j += 1;
      }
    }
    while (i < n) push(out, "remove", midA[i++]);
    while (j < m) push(out, "add", midB[j++]);
  }

  push(out, "same", a.slice(endA).join(""));
  return out;
}

/**
 * Line diff with `context` paragraphs around each change, where each changed
 * run of lines is rendered as one word-level diff row.
 */
export function reviewDiff(
  before: string,
  after: string,
  context = 1
): ReviewRow[] {
  // Paragraphs are separated by blank lines, so `context` counts paragraphs.
  const lines = compactDiff(unifiedLineDiff(before, after), context * 2);
  const rows: ReviewRow[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    if (removed.length === 0 && added.length === 0) return;
    rows.push({
      type: "change",
      segments: wordDiff(removed.join("\n"), added.join("\n")),
    });
    removed = [];
    added = [];
  };
  for (const line of lines) {
    if (line.type === "remove") removed.push(line.text);
    else if (line.type === "add") added.push(line.text);
    else {
      flush();
      if (line.text.trim()) rows.push({ type: "context", text: line.text });
    }
  }
  flush();
  return rows;
}
