/**
 * GitHub personal access token. Device-local only — never written to
 * Supabase or sent to BlogIDE's server. Same pattern as AI keys.
 */

const STORAGE_KEY = "blogide.github.pat";

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
}

export function loadGithubToken(): string {
  return read();
}

export function saveGithubToken(token: string): void {
  write(token.trim());
}

export function clearGithubToken(): void {
  write("");
}

export function maskGithubToken(token: string | undefined): string {
  if (!token) return "";
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
