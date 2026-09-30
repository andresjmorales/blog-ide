import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setTheme, THEME_BAR_COLORS } from "@/lib/theme";

function barColor(): string | null {
  const metas = document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );
  expect(metas.length).toBe(1);
  return metas[0].content;
}

describe("theme bar colour", () => {
  afterEach(() => {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  });

  it("follows the in-app theme, creating the meta once", () => {
    setTheme("dark");
    expect(barColor()).toBe(THEME_BAR_COLORS.dark);
    setTheme("light");
    expect(barColor()).toBe(THEME_BAR_COLORS.light);
  });

  it("public/theme-init.js uses the same colours", () => {
    const script = readFileSync(join(__dirname, "../public/theme-init.js"), "utf8");
    expect(script).toContain(`"${THEME_BAR_COLORS.dark}"`);
    expect(script).toContain(`"${THEME_BAR_COLORS.light}"`);
  });
});
