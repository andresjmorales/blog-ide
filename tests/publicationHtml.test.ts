import { describe, expect, it } from "vitest";
import { enhancePublicationFootnotes } from "@/lib/preview/publicationHtml";

describe("enhancePublicationFootnotes", () => {
  it("numbers footnotes and appends an endnotes section", () => {
    const raw = `<p>Hello<sup data-footnote-ref data-id="a" data-content="First note" class="footnote-ref">?</sup> and again<sup data-footnote-ref data-id="b" data-content="Second note" class="footnote-ref">?</sup>.</p>`;
    const html = enhancePublicationFootnotes(raw);
    expect(html).toContain('data-fn="1"');
    expect(html).toContain('data-fn="2"');
    expect(html).toContain('href="#fn-1"');
    expect(html).toContain('href="#fn-2"');
    expect(html).toContain('id="fn-1"');
    expect(html).toContain('href="#fnref-1"');
    expect(html).toContain('data-tip="First note"');
    expect(html).toContain("preview-footnotes");
    expect(html).toContain("First note");
    expect(html).toContain("Second note");
    expect(html).not.toMatch(/>\?</);
  });
});
