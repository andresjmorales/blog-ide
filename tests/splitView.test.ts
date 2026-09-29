// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { replacementAt } from "@/lib/editor/findReplace";
import { buildSourceMirrorHtml } from "@/lib/editor/sourceMirror";
import {
  blockKey,
  mapScroll,
  matchBlocksToLines,
  normalizeAnchors,
  previewBlocks,
  previewBlockText,
  sourceLineKey,
} from "@/lib/editor/splitScrollSync";

describe("replacementAt", () => {
  it("expands capture groups for the one match at the offset", () => {
    expect(
      replacementAt("a 12-14 b 3-4", 2, {
        query: "(\\d+)-(\\d+)",
        replacement: "$1–$2",
        regex: true,
        caseSensitive: false,
      })
    ).toEqual({ to: 7, text: "12–14" });
  });

  it("keeps `$` literal outside regex mode", () => {
    expect(
      replacementAt("cost x", 5, {
        query: "x",
        replacement: "$1",
        regex: false,
        caseSensitive: false,
      })
    ).toEqual({ to: 6, text: "$1" });
  });

  it("returns null when the text there no longer matches", () => {
    expect(
      replacementAt("hello", 1, {
        query: "hello",
        replacement: "",
        regex: false,
        caseSensitive: false,
      })
    ).toBeNull();
  });
});

describe("buildSourceMirrorHtml", () => {
  it("marks non-blank line starts and escapes text", () => {
    expect(buildSourceMirrorHtml("a<b\n\nc")).toBe(
      '<span data-l="0"></span>a&lt;b\n\n<span data-l="2"></span>c​'
    );
  });

  it("wraps matches, splitting ones that cross a line break", () => {
    const html = buildSourceMirrorHtml("ab\ncd", [{ from: 1, to: 4 }], 0);
    expect(html).toBe(
      '<span data-l="0"></span>a<mark class="blogide-find-match is-current" data-m="0">b</mark>\n' +
        '<span data-l="1"></span><mark class="blogide-find-match is-current" data-m="0">c</mark>d​'
    );
  });
});

describe("split scroll anchors", () => {
  it("reduces source lines to what the preview renders", () => {
    expect(
      sourceLineKey("## See [the *docs*](https://x.y/z) $x^2$ now[^1]")
    ).toBe("seethedocsnow");
  });

  it("pairs preview blocks with source lines in order", () => {
    const lines = [
      "---",
      "title: Hi",
      "---",
      "",
      "# Heading one",
      "",
      "A paragraph that is long enough",
      "and wraps.",
      "",
      "- item alpha",
      "- item beta",
      "",
      "$$x^2$$",
      "",
      "Heading one again later",
    ];
    const keys = [
      blockKey("Heading one"),
      blockKey("A paragraph that is long enough and wraps."),
      blockKey("item alpha"),
      blockKey("item beta"),
      null,
      blockKey("Heading one again later"),
    ];
    expect(matchBlocksToLines(keys, lines, 3)).toEqual([4, 6, 9, 10, null, 14]);
  });

  it("drops anchors that would scroll backwards", () => {
    const anchors = normalizeAnchors(
      [
        { source: 100, preview: 300 },
        { source: 200, preview: 250 },
        { source: 300, preview: 600 },
      ],
      1000,
      2000
    );
    expect(anchors).toEqual([
      { source: 0, preview: 0 },
      { source: 100, preview: 300 },
      { source: 300, preview: 600 },
      { source: 1000, preview: 2000 },
    ]);
  });

  it("interpolates both directions", () => {
    const anchors = [
      { source: 0, preview: 0 },
      { source: 100, preview: 400 },
      { source: 200, preview: 500 },
    ];
    expect(mapScroll(anchors, 50, "source")).toBe(200);
    expect(mapScroll(anchors, 450, "preview")).toBe(150);
    expect(mapScroll(anchors, 999, "source")).toBe(500);
  });

  it("reads preview text without atom node views", () => {
    const root = document.createElement("div");
    root.innerHTML =
      "<p>Energy <span contenteditable=\"false\"><span class=\"katex\">E=mc2</span></span> is conserved</p>" +
      "<ul><li><p>one</p></li><li><p>two</p></li></ul>";
    const blocks = previewBlocks(root);
    expect(blocks).toHaveLength(3);
    expect(previewBlockText(blocks[0]!)).toBe("Energy  is conserved");
    expect(previewBlockText(blocks[2]!)).toBe("two");
  });
});
