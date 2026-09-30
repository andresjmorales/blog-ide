const STORAGE_KEY = "blogide.theme";

export type ThemeMode = "light" | "dark";

/**
 * Browser / OS bar colour per in-app theme (the page --background). The app
 * theme can differ from the OS, so this is one meta set by script rather than
 * Next's viewport themeColor, which can only follow prefers-color-scheme and
 * re-renders on navigation. public/theme-init.js mirrors these values.
 */
export const THEME_BAR_COLORS: Record<ThemeMode, string> = {
  light: "#faf9f6",
  dark: "#14130f",
};

function setThemeBarColor(mode: ThemeMode): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = THEME_BAR_COLORS[mode];
}

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
  // TipTap UI Components key dark styles off `.dark`.
  root.classList.toggle("dark", next === "dark");
  setThemeBarColor(next);
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
