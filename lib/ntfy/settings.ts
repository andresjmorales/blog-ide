import type { NtfySecrets } from "@/lib/secrets/types";

const STORAGE_KEY = "blogide.ntfy.secrets";
export const NTFY_SECRETS_EVENT = "blogide-ntfy";
export const DEFAULT_NTFY_SERVER = "https://ntfy.sh";

let memory: NtfySecrets | null = null;

function readLocal(): NtfySecrets | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NtfySecrets;
    if (!parsed || typeof parsed.server !== "string") return null;
    if (!Array.isArray(parsed.topics)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocal(value: NtfySecrets | null): void {
  if (typeof window === "undefined") return;
  if (!value) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function loadNtfySecrets(): NtfySecrets | null {
  return memory ?? readLocal();
}

export function applyNtfySecrets(
  value: NtfySecrets | null,
  options: { persistLocal?: boolean } = {}
): void {
  memory = value;
  if (options.persistLocal !== false) writeLocal(value);
}

export async function saveNtfySecrets(value: NtfySecrets | null): Promise<boolean> {
  applyNtfySecrets(value, { persistLocal: true });
  const { saveNtfySecretsRemote } = await import("@/lib/secrets/client");
  const ok = await saveNtfySecretsRemote(value);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NTFY_SECRETS_EVENT));
  }
  return ok;
}

export function ntfyServerOrigin(server: string): string {
  const trimmed = server.trim() || DEFAULT_NTFY_SERVER;
  return trimmed.replace(/\/+$/, "");
}

export function randomTopicSuffix(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function ntfyTopicSlug(channelName: string): string {
  return channelName.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "notes";
}

export function ntfyTopicForChannel(channelName: string): string {
  return `blogide-${ntfyTopicSlug(channelName)}-${randomTopicSuffix()}`.slice(
    0,
    64
  );
}

export function ntfyTopicUrl(server: string, topic: string): string {
  return `${ntfyServerOrigin(server)}/${encodeURIComponent(topic)}`;
}
