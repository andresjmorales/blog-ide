import { describe, expect, it } from "vitest";
import { SuggestionKind } from "harper.js";
import {
  fromHarperSuggestion,
  parseHarperSuggestionKind,
  suggestionLabel,
  suggestionRange,
} from "@/lib/editor/harper/suggestions";

describe("harper suggestions", () => {
  it("maps Harper InsertAfter / Remove kinds", () => {
    expect(parseHarperSuggestionKind(SuggestionKind.Replace)).toBe("replace");
    expect(parseHarperSuggestionKind(SuggestionKind.Remove)).toBe("remove");
    expect(parseHarperSuggestionKind(SuggestionKind.InsertAfter)).toBe(
      "insertAfter"
    );
    expect(parseHarperSuggestionKind(2)).toBe("insertAfter");
  });

  it("reads kind() from a Harper-like suggestion object", () => {
    expect(
      fromHarperSuggestion({
        kind: () => SuggestionKind.InsertAfter,
        get_replacement_text: () => ",",
      })
    ).toEqual({ kind: "insertAfter", text: "," });
  });

  it("inserts after the span so a comma does not eat However", () => {
    expect(
      suggestionRange(1, 9, { kind: "insertAfter", text: "," })
    ).toEqual({ from: 9, to: 9, text: "," });
    expect(
      suggestionRange(1, 9, { kind: "replace", text: "However," })
    ).toEqual({ from: 1, to: 9, text: "However," });
    expect(suggestionRange(1, 5, { kind: "remove", text: "" })).toEqual({
      from: 1,
      to: 5,
      text: "",
    });
  });

  it("labels an insert-after comma as the resulting word", () => {
    expect(
      suggestionLabel("However", { kind: "insertAfter", text: "," })
    ).toBe("However,");
    expect(
      suggestionLabel("seperate", { kind: "replace", text: "separate" })
    ).toBe("separate");
    expect(suggestionLabel("very", { kind: "remove", text: "" })).toBe(
      "Remove “very”"
    );
  });
});
