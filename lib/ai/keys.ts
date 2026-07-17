/**
 * Bring-your-own API keys. Stored only in this browser (localStorage).
 * Never written to Supabase or baked into server env.
 */

export type AiProvider = "anthropic" | "openai";

const STORAGE_KEY = "blogide.aiKeys";

export type AiKeys = {
  anthropic?: string;
  openai?: string;
  /** Preferred provider when both are set. */
  preferred?: AiProvider;
  /** Offer AI help when cleaning pasted Substack/Docs imports. */
  importAssist?: boolean;
};

function read(): AiKeys {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as AiKeys;
  } catch {
    return {};
  }
}

function write(keys: AiKeys): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("blogide-ai-keys"));
  }
}

export function loadAiKeys(): AiKeys {
  return read();
}

export function saveAiKeys(patch: AiKeys): AiKeys {
  const next = { ...read(), ...patch };
  // Empty strings clear the key.
  if (patch.anthropic === "") delete next.anthropic;
  if (patch.openai === "") delete next.openai;
  write(next);
  return next;
}

export function clearAiKey(provider: AiProvider): AiKeys {
  const next = { ...read() };
  delete next[provider];
  write(next);
  return next;
}

export function getActiveProvider(keys: AiKeys = read()): AiProvider | null {
  if (keys.preferred === "openai" && keys.openai) return "openai";
  if (keys.preferred === "anthropic" && keys.anthropic) return "anthropic";
  if (keys.anthropic) return "anthropic";
  if (keys.openai) return "openai";
  return null;
}

export function maskKey(key: string | undefined): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
