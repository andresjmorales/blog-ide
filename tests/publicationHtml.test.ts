import { describe, expect, it } from "vitest";
import {
  buildPublicationPreview,
  enhancePublicationCaptions,
  enhancePublicationFootnotes,
} from "@/lib/preview/publicationHtml";

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

describe("enhancePublicationCaptions", () => {
  it("wraps captioned images in figure/figcaption", () => {
    const html = enhancePublicationCaptions(
      `<p><img src="a.png" alt="" data-caption="Lao Tzu, founder of Taoism"></p>`
    );
    expect(html).toContain('<figure class="content-figure">');
    expect(html).toContain('<figcaption class="content-caption">');
    expect(html).toContain("Lao Tzu, founder of Taoism");
    expect(html).toContain('src="a.png"');
    expect(html).not.toContain("data-caption");
  });
});

describe("buildPublicationPreview captions", () => {
  it("renders adjacent markdown captions in preview HTML", () => {
    const { bodyHtml } = buildPublicationPreview(
      "---\ntitle: T\n---\n\n![](assets/x.png)\nA visible caption\n"
    );
    expect(bodyHtml).toContain("content-figure");
    expect(bodyHtml).toContain("content-caption");
    expect(bodyHtml).toContain("A visible caption");
    expect(bodyHtml).toContain('src="assets/x.png"');
  });
});
