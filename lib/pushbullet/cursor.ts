import type { PushbulletCursor } from "@/lib/pushbullet/types";
import {
  loadAccountCaptureState,
  mergeIdLists,
  saveAccountCaptureState,
} from "@/lib/capture/accountState";

const STORAGE_KEY = "blogide.pushbullet.cursor";
const MAX_INGESTED = 400;

export function readLocalPushbulletCursor(): PushbulletCursor {
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

export function mergePushbulletCursors(
  local: PushbulletCursor,
  remote?: PushbulletCursor
): PushbulletCursor {
  if (!remote) return local;
  const times = [local.modifiedAfter, remote.modifiedAfter].filter(
    (n): n is number => typeof n === "number"
  );
  return {
    modifiedAfter: times.length > 0 ? Math.max(...times) : null,
    ingested: mergeIdLists(local.ingested, remote.ingested, MAX_INGESTED),
  };
}

export async function loadPushbulletCursor(): Promise<PushbulletCursor> {
  const local = readLocalPushbulletCursor();
  try {
    const remote = await loadAccountCaptureState();
    return mergePushbulletCursors(local, remote.pushbullet);
  } catch {
    return local;
  }
}

export async function savePushbulletCursor(
  cursor: PushbulletCursor
): Promise<void> {
  const ingested = cursor.ingested.slice(-MAX_INGESTED);
  const next = { modifiedAfter: cursor.modifiedAfter, ingested };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  try {
    await saveAccountCaptureState({ pushbullet: next });
  } catch {
    // Local cursor is enough until the next successful sync.
  }
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
