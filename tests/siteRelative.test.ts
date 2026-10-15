import { describe, expect, it } from "vitest";
import {
  absolutizeSiteRelativeMarkdown,
  essaySiteUrlForMarkdown,
  isSiteRelativeUrl,
  listSiteRelativePaths,
  normalizeSiteUrl,
  resolveEssaySiteUrl,
  relativizeSiteMarkdown,
  resolveSiteRelativeUrl,
} from "@/lib/siteRelative";

describe("site-relative URLs", () => {
  it("normalizes a bare domain to an https origin", () => {
    expect(normalizeSiteUrl("andresmorales.xyz")).toBe("https://andresmorales.xyz");
    expect(normalizeSiteUrl(" https://example.com/blog/ ")).toBe("https://example.com");
    expect(normalizeSiteUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeSiteUrl("")).toBe("");
    expect(normalizeSiteUrl("not a site")).toBe("");
    expect(normalizeSiteUrl("ftp://example.com")).toBe("");
  });

  it("only treats root-relative paths as site-relative", () => {
    expect(isSiteRelativeUrl("/writing/ordo")).toBe(true);
    expect(isSiteRelativeUrl("//cdn.example.com/x.png")).toBe(false);
    expect(isSiteRelativeUrl("./x.png")).toBe(false);
    expect(isSiteRelativeUrl("https://example.com/x")).toBe(false);
    expect(isSiteRelativeUrl("#fn-1")).toBe(false);
  });

  it("resolves against the site only when one is set", () => {
    expect(resolveSiteRelativeUrl("/writing/a.webp", "https://s.xyz")).toBe(
      "https://s.xyz/writing/a.webp"
    );
    expect(resolveSiteRelativeUrl("/writing/a.webp", "")).toBe("/writing/a.webp");
    expect(resolveSiteRelativeUrl("https://x.com/a", "https://s.xyz")).toBe(
      "https://x.com/a"
    );
  });

  it("absolutizes images, links, and reference definitions", () => {
    const md = [
      "---",
      "canonical: /writing/ordo",
      "---",
      "",
      "![Fig](/writing/ordo/fig.webp)",
      "See [my other essay](/writing/vegan-christian) and [ext](https://x.com/a).",
      'And ![t](</writing/ordo/a b.webp> "Title").',
      "",
      "[ref]: /writing/longtermism",
      "",
      "`[code](/not/this)`",
      "",
      "```",
      "[block](/not/this/either)",
      "```",
      "",
      "[^1]: A note citing [a post](/writing/god-and-science).",
    ].join("\n");
    const out = absolutizeSiteRelativeMarkdown(md, "andresmorales.xyz");
    expect(out).toContain("canonical: /writing/ordo");
    expect(out).toContain("![Fig](https://andresmorales.xyz/writing/ordo/fig.webp)");
    expect(out).toContain("[my other essay](https://andresmorales.xyz/writing/vegan-christian)");
    expect(out).toContain("[ext](https://x.com/a)");
    expect(out).toContain('![t](<https://andresmorales.xyz/writing/ordo/a b.webp> "Title")');
    expect(out).toContain("[ref]: https://andresmorales.xyz/writing/longtermism");
    expect(out).toContain("`[code](/not/this)`");
    expect(out).toContain("[block](/not/this/either)");
    expect(out).toContain("[a post](https://andresmorales.xyz/writing/god-and-science)");
  });

  it("leaves markdown untouched without a site", () => {
    const md = "![Fig](/writing/ordo/fig.webp)";
    expect(absolutizeSiteRelativeMarkdown(md, "")).toBe(md);
  });

  it("lists site-relative destinations outside code", () => {
    const md = "![a](/x.webp) [b](/y) [c](https://z.com) ![d](//cdn/e.png) `[e](/no)`\n\n[r]: /q\n";
    expect(listSiteRelativePaths(md)).toEqual(["/x.webp", "/y", "/q"]);
  });

  it("absolutizes an image whose alt text has parentheses", () => {
    const md =
      "![Landscape (1638), Rembrandt. (https://commons.wikimedia.org/wiki/File:X.jpg)](/writing/ordo/1-image.webp)\n";
    expect(absolutizeSiteRelativeMarkdown(md, "example.com")).toBe(
      "![Landscape (1638), Rembrandt. (https://commons.wikimedia.org/wiki/File:X.jpg)](https://example.com/writing/ordo/1-image.webp)\n"
    );
  });

  it("relativizes back what absolutize wrote", () => {
    const md = "---\ntitle: T\n---\n![a](/x.webp) [b](</y>) `[c](/z)`\n\n[r]: /q\n";
    const out = absolutizeSiteRelativeMarkdown(md, "example.com");
    expect(relativizeSiteMarkdown(out, "https://example.com")).toBe(md);
  });

  it("relativizes only the listed paths", () => {
    const md = "[a](https://example.com/x) [b](https://example.com/typed)";
    expect(relativizeSiteMarkdown(md, "https://example.com", new Set(["/x"]))).toBe(
      "[a](/x) [b](https://example.com/typed)"
    );
  });

  it("reads an essay's main_site from its frontmatter", () => {
    expect(essaySiteUrlForMarkdown("---\nmain_site: other.blog\n---\nx", "a.com")).toBe(
      "https://other.blog"
    );
    expect(essaySiteUrlForMarkdown("no frontmatter", "a.com")).toBe("https://a.com");
  });

  it("prefers an essay's own main_site over the account site", () => {
    expect(resolveEssaySiteUrl("other.blog", "https://andresmorales.xyz")).toBe(
      "https://other.blog"
    );
    expect(resolveEssaySiteUrl("", "andresmorales.xyz")).toBe(
      "https://andresmorales.xyz"
    );
    expect(resolveEssaySiteUrl("not a site", "andresmorales.xyz")).toBe(
      "https://andresmorales.xyz"
    );
    expect(resolveEssaySiteUrl("", "")).toBe("");
  });
});
