import { describe, expect, it } from "vitest";
import { DEFAULT_EDITOR_PREFS, mergePrefs } from "@/lib/settings";

describe("editor prefs defaults", () => {
  it("defaults markdown split / source prefs for older saved blobs", () => {
    const merged = mergePrefs({ leftWidth: 300 });
    expect(merged.allowMarkdownOnly).toBe(false);
    expect(merged.markdownSplitWidth).toBe(
      DEFAULT_EDITOR_PREFS.markdownSplitWidth
    );
    expect(merged.markdownTypingShortcuts).toBe("conservative");
    expect(merged.leftWidth).toBe(300);
  });

  it("keeps an explicit allowMarkdownOnly: true", () => {
    expect(mergePrefs({ allowMarkdownOnly: true }).allowMarkdownOnly).toBe(
      true
    );
  });
});
