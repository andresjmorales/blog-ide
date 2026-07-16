"use client";

const STORAGE_KEY = "blogide.theme";

export function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    root.style.colorScheme = next;
    localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle rounded p-1.5 text-muted hover:bg-panel hover:text-foreground"
      aria-label="Toggle light and dark theme"
      title="Toggle light and dark theme"
    >
      <svg
        className="theme-icon-light"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="3" stroke="currentColor" />
        <path
          d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M12.95 3.05l-1.42 1.42M4.47 11.53l-1.42 1.42"
          stroke="currentColor"
          strokeLinecap="round"
        />
      </svg>
      <svg
        className="theme-icon-dark"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M13.5 10.3A5.7 5.7 0 0 1 5.7 2.5 5.8 5.8 0 1 0 13.5 10.3Z"
          stroke="currentColor"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
