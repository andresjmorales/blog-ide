/**
 * Tiny line-oriented unified diff for the lossy-parse warning UI.
 * Not a full Myers algorithm — good enough for short essay sources.
 */

export type DiffLine = {
  type: "context" | "add" | "remove";
  text: string;
};

export function unifiedLineDiff(before: string, after: string): DiffLine[] {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");
  const n = a.length;
  const m = b.length;

  // LCS lengths
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array<number>(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ type: "context", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: "remove", text: a[i] });
      i += 1;
    } else {
      lines.push({ type: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    lines.push({ type: "remove", text: a[i] });
    i += 1;
  }
  while (j < m) {
    lines.push({ type: "add", text: b[j] });
    j += 1;
  }
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
