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
    expect(html).toContain('class="preview-fn"');
    expect(html).toContain("preview-fn-tip");
    expect(html).toContain("preview-footnotes");
    expect(html).toContain("First note");
    expect(html).toContain("Second note");
    expect(html).not.toContain("data-tip=");
    expect(html).not.toMatch(/>\?</);
  });

  it("keeps formatting (links/emphasis) inside hover tips", () => {
    const raw = `<p>Claim<sup data-footnote-ref data-id="a" data-content="See [source](https://example.com) and *more*." class="footnote-ref">?</sup>.</p>`;
    const html = enhancePublicationFootnotes(raw, (md) => {
      if (md.includes("example.com")) {
        return `<p>See <a href="https://example.com">source</a> and <em>more</em>.</p>`;
      }
      return `<p>${md}</p>`;
    });
    expect(html).toContain('class="preview-fn-tip"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("<em>more</em>");
    // Tip and endnote both carry the formatted body.
    expect(html.match(/href="https:\/\/example\.com"/g)?.length).toBe(2);
  });

  it("keeps tip content after HTML reparse (no block hoist)", () => {
    const raw = `<p>Hi<sup data-footnote-ref data-id="a" data-content="note" class="footnote-ref">?</sup>.</p>`;
    const html = enhancePublicationFootnotes(
      raw,
      () => `<p>Hello <em>world</em> and <a href="https://example.com">link</a>.</p>`
    );
    const doc = new DOMParser().parseFromString(
      `<div id="root">${html}</div>`,
      "text/html"
    );
    const tip = doc.querySelector(".preview-fn-tip");
    expect(tip?.textContent).toContain("Hello");
    expect(tip?.textContent).toContain("world");
    expect(tip?.querySelector("em")?.textContent).toBe("world");
    expect(tip?.querySelector('a[href="https://example.com"]')?.textContent).toBe(
      "link"
    );
    // Block <p> must not survive inside the tip (would be hoisted empty).
    expect(tip?.querySelector("p")).toBeNull();
  });

  it("preserves paragraph breaks inside hover tips", () => {
    const raw = `<p>Hi<sup data-footnote-ref data-id="a" data-content="note" class="footnote-ref">?</sup>.</p>`;
    const html = enhancePublicationFootnotes(
      raw,
      () => `<p>First paragraph.</p><p>Second paragraph.</p>`
    );
    expect(html).toContain("First paragraph.<br><br>Second paragraph.");
    const body = html.match(
      /preview-footnotes-body">([\s\S]*?)<\/div>/
    )?.[1];
    expect(body).toContain("<p>First paragraph.</p>");
    expect(body).toContain("<p>Second paragraph.</p>");
  });

  it("keeps ordered-list content inside the tip (no block hoist)", () => {
    const raw = `<p>Claim<sup data-footnote-ref data-id="a" data-content="list" class="footnote-ref">?</sup>.</p>`;
    const html = enhancePublicationFootnotes(
      raw,
      () =>
        `<p>Here is the list:</p><ol><li><p><a href="https://a.example">one</a></p></li><li><p>two</p></li></ol>`
    );
    const doc = new DOMParser().parseFromString(
      `<div id="root">${html}</div>`,
      "text/html"
    );
    const tip = doc.querySelector(".preview-fn-tip");
    expect(tip).not.toBeNull();
    expect(tip?.querySelector("p")).toBeNull();
    expect(tip?.querySelector("ol")).toBeNull();
    expect(tip?.querySelector("ul")).toBeNull();
    expect(tip?.querySelector("li")).toBeNull();
    expect(tip?.textContent).toContain("Here is the list:");
    expect(tip?.textContent).toMatch(/1\.\s*one/);
    expect(tip?.textContent).toMatch(/2\.\s*two/);
    expect(
      tip?.querySelector('a[href="https://a.example"]')?.textContent
    ).toBe("one");
    // List text must stay in the tip — not as a sibling block outside .preview-fn.
    const paragraph = doc.querySelector("#root > p");
    const outside = [...(paragraph?.childNodes ?? [])]
      .filter((n) => !(n instanceof HTMLElement && n.classList.contains("preview-fn")))
      .map((n) => n.textContent ?? "")
      .join("");
    expect(outside).not.toMatch(/two/);
    expect(outside).toMatch(/Claim/);
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
