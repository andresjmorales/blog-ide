import type { PushbulletRuntimeStatus } from "@/lib/pushbullet/types";

const STORAGE_KEY = "blogide.pushbullet.status";
export const PUSHBULLET_STATUS_EVENT = "blogide-pushbullet-status";

export function loadPushbulletStatus(): PushbulletRuntimeStatus {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PushbulletRuntimeStatus;
  } catch {
    return {};
  }
}

export function savePushbulletStatus(
  patch: PushbulletRuntimeStatus
): PushbulletRuntimeStatus {
  const next = { ...loadPushbulletStatus(), ...patch };
  if (typeof window === "undefined") return next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(PUSHBULLET_STATUS_EVENT));
  return next;
}

export function clearPushbulletStatus(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(PUSHBULLET_STATUS_EVENT));
}
