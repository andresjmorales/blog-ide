import { describe, expect, it } from "vitest";
import {
  addHarperDictionaryWord,
  dictionaryHasWord,
  normalizeHarperDictionary,
  normalizeHarperWord,
  removeHarperDictionaryWord,
  sameWordList,
} from "@/lib/editor/harper/dictionary";
import {
  harperKindEnabled,
  harperKindLabel,
  setHarperKindEnabled,
} from "@/lib/editor/harper/kinds";
import { mergePrefs } from "@/lib/settings";

describe("harper dictionary", () => {
  it("trims, dedupes, and caps words", () => {
    expect(normalizeHarperWord("  BlogIDE  ")).toBe("BlogIDE");
    expect(normalizeHarperWord("")).toBeNull();
    expect(
      normalizeHarperDictionary(["TipTap", "tiptap", "  Harper  ", ""])
    ).toEqual(["TipTap", "Harper"]);
  });

  it("adds and removes case-insensitively", () => {
    const added = addHarperDictionaryWord(["BlogIDE"], "blogide");
    expect(added).toEqual(["BlogIDE"]);
    expect(addHarperDictionaryWord([], "  wasm ")).toEqual(["wasm"]);
    expect(removeHarperDictionaryWord(["BlogIDE", "TipTap"], "blogide")).toEqual(
      ["TipTap"]
    );
    expect(dictionaryHasWord(["BlogIDE"], "blogide")).toBe(true);
    expect(sameWordList(["A", "b"], ["b", "a"])).toBe(true);
  });
});

describe("harper issue types", () => {
  it("toggles Readability in the disabled list", () => {
    const disabled = setHarperKindEnabled([], "Readability", false);
    expect(disabled).toEqual(["Readability"]);
    expect(harperKindEnabled(disabled, "Readability")).toBe(false);
    expect(harperKindEnabled(disabled, "Spelling")).toBe(true);
    expect(setHarperKindEnabled(disabled, "Readability", true)).toEqual([]);
    expect(harperKindLabel("WordChoice")).toBe("Word choice");
    expect(harperKindLabel("Readability")).toBe("Readability");
  });
});

describe("editor prefs harper fields", () => {
  it("defaults dictionary and disabled kinds on older blobs", () => {
    const merged = mergePrefs({ leftWidth: 280 });
    expect(merged.harperDictionary).toEqual([]);
    expect(merged.harperDisabledKinds).toEqual([]);
  });

  it("keeps a saved dictionary and sanitizes junk", () => {
    const merged = mergePrefs({
      harperDictionary: [" BlogIDE ", "blogide", "", 12 as unknown as string],
      harperDisabledKinds: ["Readability", "Readability", ""],
    });
    expect(merged.harperDictionary).toEqual(["BlogIDE"]);
    expect(merged.harperDisabledKinds).toEqual(["Readability"]);
  });
});
