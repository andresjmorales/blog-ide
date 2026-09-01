/**
 * Pushbullet access token. Prefer the encrypted account vault; localStorage
 * is only a fallback until hydrate, and a cache if the vault is unreachable.
 */

import { clearPushbulletCursor } from "@/lib/pushbullet/cursor";
import { clearPushbulletStatus } from "@/lib/pushbullet/status";

const STORAGE_KEY = "blogide.pushbullet.token";
export const PUSHBULLET_TOKEN_EVENT = "blogide-pushbullet";

let memory = "";

function readLocal(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeLocal(token: string): void {
  if (typeof window === "undefined") return;
  if (!token) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, token);
}

export function loadPushbulletToken(): string {
  return memory || readLocal();
}

export function applyPushbulletToken(
  token: string,
  options: { persistLocal?: boolean } = {}
): void {
  const next = token.trim();
  if (next !== loadPushbulletToken()) {
    clearPushbulletCursor();
    clearPushbulletStatus();
  }
  memory = next;
  if (options.persistLocal !== false) writeLocal(next);
}

export async function savePushbulletToken(token: string): Promise<boolean> {
  applyPushbulletToken(token, { persistLocal: true });
  const { savePushbulletTokenRemote } = await import("@/lib/secrets/client");
  const ok = await savePushbulletTokenRemote(token.trim());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PUSHBULLET_TOKEN_EVENT));
  }
  return ok;
}

export async function clearPushbulletToken(): Promise<boolean> {
  applyPushbulletToken("", { persistLocal: true });
  const { savePushbulletTokenRemote } = await import("@/lib/secrets/client");
  const ok = await savePushbulletTokenRemote("");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PUSHBULLET_TOKEN_EVENT));
  }
  return ok;
}

export function maskPushbulletToken(token: string | undefined): string {
  if (!token) return "";
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
