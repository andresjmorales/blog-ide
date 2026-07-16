const STORAGE_KEY = "blogide.theme";

export type ThemeMode = "light" | "dark";

export function getTheme(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(next: ThemeMode): void {
  const root = document.documentElement;
  root.dataset.theme = next;
  root.style.colorScheme = next;
  localStorage.setItem(STORAGE_KEY, next);
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
