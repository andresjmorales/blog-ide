import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  isLossy,
  parseBody,
  previewRoundTrip,
} from "@/lib/markdown/pipeline";

function hasMark(
  node: JSONContent,
  type: "bold" | "italic",
  text: string
): boolean {
  if (
    node.type === "text" &&
    node.text === text &&
    node.marks?.some((mark) => mark.type === type)
  ) {
    return true;
  }
  return (node.content ?? []).some((child) => hasMark(child, type, text));
}

describe("emphasis lossy checks", () => {
  it("does not warn for literal asterisks after a word", () => {
    const markdown = "“De Descriptione Temporum*”* C.S.\n";

    expect(isLossy(markdown)).toBe(false);
    expect(previewRoundTrip(markdown)).toContain(
      "“De Descriptione Temporum\\*”\\* C.S."
    );
  });

  it("preserves italic punctuation with HTML when Markdown flanking fails", () => {
    const markdown = "Temporum<em>”</em> next\n";
    const tripped = previewRoundTrip(markdown);

    expect(tripped).toBe(markdown);
    expect(hasMark(parseBody(tripped), "italic", "”")).toBe(true);
    expect(isLossy(markdown)).toBe(false);
  });

  it("keeps valid punctuation-only Markdown emphasis", () => {
    const markdown = "a *”* b\n";

    expect(previewRoundTrip(markdown)).toBe(markdown);
    expect(hasMark(parseBody(markdown), "italic", "”")).toBe(true);
    expect(isLossy(markdown)).toBe(false);
  });

  it("continues to serialize ordinary Markdown emphasis", () => {
    const markdown = "a *italic* word\n";

    expect(previewRoundTrip(markdown)).toBe(markdown);
    expect(hasMark(parseBody(markdown), "italic", "italic")).toBe(true);
    expect(isLossy(markdown)).toBe(false);
  });

  it("continues to serialize ordinary Markdown bold", () => {
    const markdown = "a **bold** word\n";

    expect(previewRoundTrip(markdown)).toBe(markdown);
    expect(hasMark(parseBody(markdown), "bold", "bold")).toBe(true);
    expect(isLossy(markdown)).toBe(false);
  });
});
