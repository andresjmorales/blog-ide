const IDLE_KEY = "blogide.vaultIdleLock";
const GITHUB_KEY = "blogide.githubIncludeVault";
const AI_OPT_IN_KEY = "blogide.vaultAiOptIn";

export type VaultIdleLock = "off" | "15m" | "1h" | "8h";

const IDLE_MS: Record<Exclude<VaultIdleLock, "off">, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "8h": 8 * 60 * 60 * 1000,
};

export function loadVaultIdleLock(): VaultIdleLock {
  if (typeof window === "undefined") return "off";
  const raw = window.localStorage.getItem(IDLE_KEY);
  if (raw === "15m" || raw === "1h" || raw === "8h" || raw === "off") return raw;
  return "off";
}

export function saveVaultIdleLock(value: VaultIdleLock): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IDLE_KEY, value);
}

export function vaultIdleLockMs(value: VaultIdleLock): number | null {
  if (value === "off") return null;
  return IDLE_MS[value];
}

export function loadGithubIncludeVault(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(GITHUB_KEY) === "1";
}

export function saveGithubIncludeVault(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GITHUB_KEY, value ? "1" : "0");
}

export function loadVaultAiOptIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(AI_OPT_IN_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveVaultAiOptIn(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(AI_OPT_IN_KEY, "1");
    else window.sessionStorage.removeItem(AI_OPT_IN_KEY);
  } catch {
    // private mode
  }
}
