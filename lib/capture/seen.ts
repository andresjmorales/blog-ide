const SEEN_KEY = "blogide.shellSeenAtMs";

export function loadShellSeenAtMs(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(SEEN_KEY);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function markShellSeen(atMs: number = Date.now()): void {
  localStorage.setItem(SEEN_KEY, String(atMs));
  window.dispatchEvent(new Event("blogide-shell-seen"));
}

export function subscribeShellSeen(listener: () => void): () => void {
  window.addEventListener("blogide-shell-seen", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("blogide-shell-seen", listener);
    window.removeEventListener("storage", listener);
  };
}
