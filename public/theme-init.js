(function () {
  try {
    var key = "blogide.theme";
    var stored = localStorage.getItem(key);
    var theme =
      stored === "light" || stored === "dark"
        ? stored
        : matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    // Status / title bar colour; mirrors THEME_BAR_COLORS in lib/theme.ts.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = theme === "dark" ? "#14130f" : "#faf9f6";
  } catch {
    /* ignore */
  }
})();
