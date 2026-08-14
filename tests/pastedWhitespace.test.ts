import { describe, expect, it } from "vitest";
import {
  jsonFromPastedPlainText,
  normalizePastedHtml,
} from "@/lib/editor/normalizePastedWhitespace";
import { collapseExtraBlankLines } from "@/lib/editor/cleanWhitespace";
import { serializeBody } from "@/lib/markdown/pipeline";

describe("collapseExtraBlankLines", () => {
  it("turns one-or-more empty lines into a single markdown paragraph break", () => {
    expect(collapseExtraBlankLines("Hello\n\n\n\nWorld")).toBe("Hello\n\nWorld");
    expect(collapseExtraBlankLines("Hello\n\nWorld")).toBe("Hello\n\nWorld");
  });
});

describe("normalizePastedHtml", () => {
  it("drops extra empty paragraphs from Word / Docs / PDF HTML paste", () => {
    const html = "<p>Hello</p><p><br></p><p><br></p><p>World</p>";
    const next = normalizePastedHtml(html);
    expect(next).toContain("Hello");
    expect(next).toContain("World");
    expect(next.match(/<p[\s>]/gi)?.length).toBe(2);
    expect(next).not.toMatch(/<p>\s*(<br\s*\/?>|&nbsp;)?\s*<\/p>/i);
  });

  it("leaves preformatted extra newlines alone", () => {
    const html = "<pre>a\n\n\n\nb</pre><p>after</p>";
    expect(normalizePastedHtml(html)).toContain("<pre>a\n\n\n\nb</pre>");
  });
});

describe("jsonFromPastedPlainText", () => {
  it("does not create empty paragraphs from extra blank lines", () => {
    const json = jsonFromPastedPlainText("Hello\n\n\n\nWorld\n");
    const emptyParagraphs = (json.content ?? []).filter(
      (node) =>
        node.type === "paragraph" &&
        (!node.content || node.content.length === 0)
    );
    expect(emptyParagraphs).toHaveLength(0);
    expect(serializeBody(json).trim()).toBe("Hello\n\nWorld");
  });

  it("keeps PDF wraps in one paragraph instead of splitting every line", () => {
    const json = jsonFromPastedPlainText(
      "Line one of a wrapped\nparagraph from a PDF.\n\nNext paragraph.\n"
    );
    expect(json.content).toHaveLength(2);
    expect(serializeBody(json).trim()).toBe(
      "Line one of a wrapped\nparagraph from a PDF.\n\nNext paragraph."
    );
  });

  it("still parses markdown lists", () => {
    const json = jsonFromPastedPlainText("- alpha\n- beta\n");
    expect(json.content?.[0]?.type).toBe("bulletList");
  });
});
