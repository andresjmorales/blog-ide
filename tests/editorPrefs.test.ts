import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_PREFS,
  mergePrefs,
  mergeRemotePrefs,
} from "@/lib/settings";

describe("editor prefs defaults", () => {
  it("defaults markdown split / source prefs for older saved blobs", () => {
    const merged = mergePrefs({ leftWidth: 300 });
    expect(merged.allowMarkdownOnly).toBe(false);
    expect(merged.markdownSplitWidth).toBe(
      DEFAULT_EDITOR_PREFS.markdownSplitWidth
    );
    expect(merged.markdownTypingShortcuts).toBe("conservative");
    expect(merged.typography).toBe(true);
    expect(merged.smartQuotes).toBe(true);
    expect(merged.fetchBibleEnabled).toBe(false);
    expect(merged.leftWidth).toBe(300);
    expect(merged.toolbarLayout.some((slot) => slot.type === "overflow")).toBe(
      true
    );
  });

  it("maps an older smartQuotes: false blob onto typography", () => {
    expect(mergePrefs({ smartQuotes: false }).typography).toBe(false);
  });

  it("keeps an explicit typography: false", () => {
    expect(mergePrefs({ typography: false }).typography).toBe(false);
  });

  it("keeps an explicit allowMarkdownOnly: true", () => {
    expect(mergePrefs({ allowMarkdownOnly: true }).allowMarkdownOnly).toBe(
      true
    );
  });

  it("keeps fetch(bible) off unless explicitly enabled", () => {
    expect(mergePrefs({}).fetchBibleEnabled).toBe(false);
    expect(mergePrefs({ fetchBibleEnabled: true }).fetchBibleEnabled).toBe(
      true
    );
  });
});

describe("account prefs from another device", () => {
  it("applies account settings but keeps this screen's layout", () => {
    const merged = mergeRemotePrefs(
      { leftWidth: 300, siteUrl: "", dashStyle: "chicago" },
      { leftWidth: 500, siteUrl: "https://andresmorales.xyz", dashStyle: "mla" }
    );
    expect(merged.leftWidth).toBe(300);
    expect(merged.siteUrl).toBe("https://andresmorales.xyz");
    expect(merged.dashStyle).toBe("mla");
  });

  it("keeps dictionary words from both devices", () => {
    const merged = mergeRemotePrefs(
      { harperDictionary: ["ordo", "amoris"] },
      { harperDictionary: ["amoris", "Kocman"] }
    );
    expect(merged.harperDictionary).toEqual(["ordo", "amoris", "Kocman"]);
  });

  it("keeps local values for keys the account copy lacks", () => {
    const merged = mergeRemotePrefs({ siteUrl: "https://a.xyz" }, {});
    expect(merged.siteUrl).toBe("https://a.xyz");
  });
});
