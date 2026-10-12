/**
 * The last version of each essay that BlogIDE and GitHub agreed on (after a
 * push, a pull, or a check that found them identical). Pull uses it as the
 * base of a three-way merge, so "your BlogIDE edits" and "GitHub's commits"
 * can be told apart.
 *
 * Only the git blob sha is kept (GitHub still has the content), on this
 * device. Without a record, pull falls back to matching GitHub history
 * against BlogIDE's saved versions.
 */

const STORAGE_KEY = "blogide.github.syncBase.v1";
const MAX_RECORDS = 500;

export type GithubSyncBase = {
  repo: string;
  branch: string;
  path: string;
  /** Git blob sha of the file both sides had. */
  blobSha: string;
  /** When BlogIDE saw them agree (ISO). */
  at: string;
};

type Store = Record<string, GithubSyncBase>;

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(store);
    if (entries.length > MAX_RECORDS) {
      entries.sort((x, y) => (x[1].at < y[1].at ? 1 : -1));
      store = Object.fromEntries(entries.slice(0, MAX_RECORDS));
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked: pull falls back to history matching.
  }
}

function sameRepo(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The recorded sync point for an essay, if it is for this repo + branch. */
export function loadGithubSyncBase(
  nodeId: string,
  repo: string,
  branch: string
): GithubSyncBase | null {
  const record = readStore()[nodeId];
  if (!record || typeof record.blobSha !== "string") return null;
  if (!sameRepo(record.repo, repo) || record.branch !== branch) return null;
  return record;
}

export function recordGithubSyncBases(
  rows: Array<{ nodeId: string } & Omit<GithubSyncBase, "at">>,
  at = new Date().toISOString()
): void {
  if (rows.length === 0) return;
  const store = readStore();
  for (const { nodeId, ...row } of rows) {
    store[nodeId] = { ...row, at };
  }
  writeStore(store);
}
