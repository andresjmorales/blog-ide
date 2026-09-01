import type { PushbulletCursor } from "@/lib/pushbullet/types";

const STORAGE_KEY = "blogide.pushbullet.cursor";
const MAX_INGESTED = 400;

export function loadPushbulletCursor(): PushbulletCursor {
  if (typeof window === "undefined") {
    return { modifiedAfter: null, ingested: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { modifiedAfter: null, ingested: [] };
    const parsed = JSON.parse(raw) as Partial<PushbulletCursor>;
    const modifiedAfter =
      typeof parsed.modifiedAfter === "number" &&
      Number.isFinite(parsed.modifiedAfter)
        ? parsed.modifiedAfter
        : null;
    const ingested = Array.isArray(parsed.ingested)
      ? parsed.ingested.filter((id): id is string => typeof id === "string")
      : [];
    return { modifiedAfter, ingested };
  } catch {
    return { modifiedAfter: null, ingested: [] };
  }
}

export function savePushbulletCursor(cursor: PushbulletCursor): void {
  if (typeof window === "undefined") return;
  const ingested = cursor.ingested.slice(-MAX_INGESTED);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      modifiedAfter: cursor.modifiedAfter,
      ingested,
    } satisfies PushbulletCursor)
  );
}

export function clearPushbulletCursor(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function markIngested(
  cursor: PushbulletCursor,
  idens: string[],
  modifiedAfter: number | null
): PushbulletCursor {
  const seen = new Set(cursor.ingested);
  for (const iden of idens) seen.add(iden);
  const nextModified =
    modifiedAfter != null &&
    (cursor.modifiedAfter == null || modifiedAfter > cursor.modifiedAfter)
      ? modifiedAfter
      : cursor.modifiedAfter;
  return {
    modifiedAfter: nextModified,
    ingested: [...seen].slice(-MAX_INGESTED),
  };
}
