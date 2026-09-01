import {
  loadAccountCaptureState,
  mergeIdLists,
  saveAccountCaptureState,
} from "@/lib/capture/accountState";

const STORAGE_KEY = "blogide.ntfy.cursor";
const MAX_INGESTED = 400;

export type NtfyCursor = {
  since: number | null;
  ingested: string[];
};

export function readLocalNtfyCursor(): NtfyCursor {
  if (typeof window === "undefined") return { since: null, ingested: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { since: null, ingested: [] };
    const parsed = JSON.parse(raw) as Partial<NtfyCursor>;
    const since =
      typeof parsed.since === "number" && Number.isFinite(parsed.since)
        ? parsed.since
        : null;
    const ingested = Array.isArray(parsed.ingested)
      ? parsed.ingested.filter((id): id is string => typeof id === "string")
      : [];
    return { since, ingested };
  } catch {
    return { since: null, ingested: [] };
  }
}

export function mergeNtfyCursors(
  local: NtfyCursor,
  remote?: NtfyCursor
): NtfyCursor {
  if (!remote) return local;
  const times = [local.since, remote.since].filter(
    (n): n is number => typeof n === "number"
  );
  return {
    since: times.length > 0 ? Math.max(...times) : null,
    ingested: mergeIdLists(local.ingested, remote.ingested, MAX_INGESTED),
  };
}

export async function loadNtfyCursor(): Promise<NtfyCursor> {
  const local = readLocalNtfyCursor();
  try {
    const remote = await loadAccountCaptureState();
    return mergeNtfyCursors(local, remote.ntfy);
  } catch {
    return local;
  }
}

export async function saveNtfyCursor(cursor: NtfyCursor): Promise<void> {
  const next = {
    since: cursor.since,
    ingested: cursor.ingested.slice(-MAX_INGESTED),
  };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  try {
    await saveAccountCaptureState({ ntfy: next });
  } catch {
    // Local cursor is enough until the next successful sync.
  }
}

export function markNtfyIngested(
  cursor: NtfyCursor,
  ids: string[],
  since: number | null
): NtfyCursor {
  const seen = new Set(cursor.ingested);
  for (const id of ids) seen.add(id);
  const nextSince =
    since != null && (cursor.since == null || since > cursor.since)
      ? since
      : cursor.since;
  return { since: nextSince, ingested: [...seen].slice(-MAX_INGESTED) };
}
