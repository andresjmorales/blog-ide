import { describe, expect, it } from "vitest";
import {
  bibleQuoteClipboardText,
  looksLikeFetchBibleHtml,
  prepareBibleQuoteHtml,
  wrapBibleQuoteAsBlockquote,
} from "@/lib/bible/quoteHtml";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import { normalizePastedHtml } from "@/lib/editor/normalizePastedWhitespace";

const JOHN_316 = `
<h3 data-c="3">3</h3>
<h4 class="fb-s">For God So Loved</h4>
<p class="fb-p"><sup data-v="16">16</sup>For God so loved the world that He gave His one and only <span class="fb-note"><span>Or unique</span></span> Son, that everyone who believes in Him shall not perish but have eternal life.</p>
<p class="fb-p"><sup data-v="17">17</sup>For God did not send His Son into the world to condemn the world.</p>
`;

describe("prepareBibleQuoteHtml", () => {
  it("detects fetch.bible HTML", () => {
    expect(looksLikeFetchBibleHtml(JOHN_316)).toBe(true);
    expect(looksLikeFetchBibleHtml("<p>Just a paragraph.</p>")).toBe(false);
  });

  it("strips headings and notes and keeps verse superscripts", () => {
    const html = prepareBibleQuoteHtml(JOHN_316);
    expect(html).not.toMatch(/For God So Loved/);
    expect(html).not.toMatch(/>3</);
    expect(html).not.toMatch(/Or unique/);
    expect(html).toContain("<sup");
    expect(html).toContain(">16<");
    expect(html).toContain(">17<");
    expect(html).toContain("For God so loved the world");
  });

  it("wraps a citation line under the passage", () => {
    const quote = wrapBibleQuoteAsBlockquote(
      prepareBibleQuoteHtml(JOHN_316),
      "John 3:16 (BSB)"
    );
    expect(quote.startsWith("<blockquote>")).toBe(true);
    expect(quote).toContain("— John 3:16 (BSB)");
  });

  it("inserts a blockquote with superscripted verse numbers", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: createExtensions(),
      content: parseBody("Intro.\n"),
    });
    try {
      editor.commands.insertContent(
        wrapBibleQuoteAsBlockquote(
          prepareBibleQuoteHtml(JOHN_316),
          "John 3:16 (BSB)"
        )
      );
      const md = serializeBody(editor.getJSON());
      expect(md).toContain(">");
      expect(md).toContain("<sup>16</sup>");
      expect(md).toContain("— John 3:16 (BSB)");
      expect(md).not.toContain("For God So Loved");
    } finally {
      editor.destroy();
    }
  });

  it("pastes verse numbers as superscript marks", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: createExtensions(),
      content: parseBody("Intro.\n"),
    });
    try {
      editor.commands.insertContent(
        normalizePastedHtml(prepareBibleQuoteHtml(JOHN_316))
      );
      const md = serializeBody(editor.getJSON());
      expect(md).toContain("<sup>16</sup>");
      expect(md).toContain("<sup>17</sup>");
      expect(md).not.toContain("For God So Loved");
    } finally {
      editor.destroy();
    }
  });
});

describe("bibleQuoteClipboardText", () => {
  const PSALM = `
<div class="fb-chapter" data-c="23">
<h3 data-c="23">23</h3>
<h4 class="fb-s">The LORD Is My Shepherd</h4>
<p class="fb-q1"><sup data-v="1">1</sup>The LORD is my shepherd;</p>
<p class="fb-q2">I shall not want.</p>
</div>
<div class="fb-attribution"><a href="#">Berean</a></div>
`;

  it("copies plain verse text with the citation", () => {
    const text = bibleQuoteClipboardText(JOHN_316, {
      markers: false,
      citation: "John 3:16–17 (BSB)",
    });
    expect(text).toBe(
      "For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.\n\n" +
        "For God did not send His Son into the world to condemn the world.\n\n" +
        "— John 3:16–17 (BSB)"
    );
  });

  it("copies chapter, heading, verse and footnote markers", () => {
    const text = bibleQuoteClipboardText(JOHN_316, {
      markers: true,
      citation: "John 3:16–17 (BSB)",
    });
    expect(text).toBe(
      "Chapter 3\n\n" +
        "For God So Loved\n\n" +
        "[16] For God so loved the world that He gave His one and only [a] Son, that everyone who believes in Him shall not perish but have eternal life.\n\n" +
        "[17] For God did not send His Son into the world to condemn the world.\n\n" +
        "[a] Or unique\n\n" +
        "— John 3:16–17 (BSB)"
    );
  });

  it("keeps poetry lines together and drops attribution", () => {
    expect(bibleQuoteClipboardText(PSALM, { markers: false })).toBe(
      "The LORD is my shepherd;\nI shall not want."
    );
    expect(bibleQuoteClipboardText(PSALM, { markers: true })).toBe(
      "Chapter 23\n\nThe LORD Is My Shepherd\n\n[1] The LORD is my shepherd;\nI shall not want."
    );
  });
});
