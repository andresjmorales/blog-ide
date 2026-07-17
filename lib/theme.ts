const STORAGE_KEY = "blogide.theme";

export type ThemeMode = "light" | "dark";

function systemTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    return matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

export function getTheme(): ThemeMode {
  if (typeof document === "undefined") return "light";
  const fromDom = document.documentElement.dataset.theme;
  if (fromDom === "dark" || fromDom === "light") return fromDom;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // ignore
  }
  return systemTheme();
}

export function setTheme(next: ThemeMode): void {
  const root = document.documentElement;
  root.dataset.theme = next;
  root.style.colorScheme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore quota / private mode
  }
}

/** Re-apply stored theme (e.g. after hydration if the early script was late). */
export function applyStoredTheme(): ThemeMode {
  const next = getTheme();
  setTheme(next);
  return next;
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
