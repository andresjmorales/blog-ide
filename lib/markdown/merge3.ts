/**
 * Line-based three-way merge (diff3) for GitHub pulls: the last version
 * BlogIDE and GitHub agreed on is the base, BlogIDE's draft is "local",
 * the GitHub file is "remote". Runs where only one side changed merge
 * cleanly; runs both sides changed differently are conflicts.
 *
 * Essays keep a paragraph per line, so a conflict is usually "both of you
 * edited this paragraph".
 */

import { unifiedLineDiff } from "@/lib/markdown/diff";

export type MergeChunk =
  | { kind: "ok"; lines: string[] }
  | {
      kind: "conflict";
      base: string[];
      local: string[];
      remote: string[];
    };

export type ThreeWayMerge = {
  chunks: MergeChunk[];
  conflicts: number;
};

export type ConflictChoice = "local" | "remote" | "both";

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

/** For each base line, the index of the matching line in `other` (or -1). */
function matchLines(base: string, other: string, baseLength: number): Int32Array {
  const map = new Int32Array(baseLength).fill(-1);
  let i = 0;
  let j = 0;
  for (const line of unifiedLineDiff(base, other)) {
    if (line.type === "context") {
      map[i] = j;
      i += 1;
      j += 1;
    } else if (line.type === "remove") {
      i += 1;
    } else {
      j += 1;
    }
  }
  return map;
}

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, k) => line === b[k]);
}

export function mergeThreeWay(
  base: string,
  local: string,
  remote: string
): ThreeWayMerge {
  const o = splitLines(base);
  const a = splitLines(local);
  const b = splitLines(remote);
  const toA = matchLines(base, local, o.length);
  const toB = matchLines(base, remote, o.length);

  const chunks: MergeChunk[] = [];
  let conflicts = 0;
  const pushOk = (lines: string[]) => {
    if (lines.length === 0) return;
    const last = chunks[chunks.length - 1];
    if (last?.kind === "ok") last.lines.push(...lines);
    else chunks.push({ kind: "ok", lines: [...lines] });
  };

  let i = 0;
  let ia = 0;
  let ib = 0;
  while (i < o.length || ia < a.length || ib < b.length) {
    if (i < o.length && toA[i] === ia && toB[i] === ib) {
      pushOk([o[i]]);
      i += 1;
      ia += 1;
      ib += 1;
      continue;
    }
    // Next base line both sides still share: the end of this unstable run.
    let next = i;
    while (
      next < o.length &&
      !(toA[next] >= ia && toB[next] >= ib)
    ) {
      next += 1;
    }
    const endA = next < o.length ? toA[next] : a.length;
    const endB = next < o.length ? toB[next] : b.length;
    const baseRun = o.slice(i, next);
    const localRun = a.slice(ia, endA);
    const remoteRun = b.slice(ib, endB);

    if (sameLines(localRun, baseRun)) pushOk(remoteRun);
    else if (sameLines(remoteRun, baseRun)) pushOk(localRun);
    else if (sameLines(localRun, remoteRun)) pushOk(localRun);
    else {
      chunks.push({
        kind: "conflict",
        base: baseRun,
        local: localRun,
        remote: remoteRun,
      });
      conflicts += 1;
    }
    i = next;
    ia = endA;
    ib = endB;
  }

  return { chunks, conflicts };
}

/**
 * Text of a merge. Conflict `k` (in order) takes `choices[k]`, defaulting
 * to `fallback`.
 */
export function resolveThreeWay(
  merge: ThreeWayMerge,
  choices: Record<number, ConflictChoice> = {},
  fallback: ConflictChoice = "local"
): string {
  const out: string[] = [];
  let k = 0;
  for (const chunk of merge.chunks) {
    if (chunk.kind === "ok") {
      out.push(...chunk.lines);
      continue;
    }
    const choice = choices[k] ?? fallback;
    k += 1;
    if (choice === "local") out.push(...chunk.local);
    else if (choice === "remote") out.push(...chunk.remote);
    else out.push(...chunk.local, ...chunk.remote);
  }
  return out.join("\n");
}
