import { describe, expect, it } from "vitest";
import {
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
