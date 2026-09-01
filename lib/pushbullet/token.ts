/**
 * Pushbullet access token. Device-local only — never written to
 * Supabase or sent to BlogIDE's server. Same pattern as GitHub PAT / AI keys.
 */

import { clearPushbulletCursor } from "@/lib/pushbullet/cursor";
import { clearPushbulletStatus } from "@/lib/pushbullet/status";

const STORAGE_KEY = "blogide.pushbullet.token";
export const PUSHBULLET_TOKEN_EVENT = "blogide-pushbullet";

function read(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function write(token: string): void {
  if (typeof window === "undefined") return;
  if (!token) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, token);
  window.dispatchEvent(new Event(PUSHBULLET_TOKEN_EVENT));
}

export function loadPushbulletToken(): string {
  return read();
}

export function savePushbulletToken(token: string): void {
  const next = token.trim();
  if (next !== read()) {
    clearPushbulletCursor();
    clearPushbulletStatus();
  }
  write(next);
}

export function clearPushbulletToken(): void {
  clearPushbulletCursor();
  clearPushbulletStatus();
  write("");
}

export function maskPushbulletToken(token: string | undefined): string {
  if (!token) return "";
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
