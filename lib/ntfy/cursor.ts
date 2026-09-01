const STORAGE_KEY = "blogide.ntfy.cursor";
const MAX_INGESTED = 400;

export type NtfyCursor = {
  since: number | null;
  ingested: string[];
};

export function loadNtfyCursor(): NtfyCursor {
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

export function saveNtfyCursor(cursor: NtfyCursor): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      since: cursor.since,
      ingested: cursor.ingested.slice(-MAX_INGESTED),
    } satisfies NtfyCursor)
  );
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
