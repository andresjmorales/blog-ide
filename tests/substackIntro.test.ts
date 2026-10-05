import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARKERS_OPTIONS,
  htmlForPublishTarget,
} from "@/lib/export/clipboardHtml";
import {
  parseSubstackIntro,
  substackIntroFromMarkdown,
  writeSubstackIntro,
} from "@/lib/markdown/substackIntro";

const INTRO =
  "*Crossposted to [my site](https://example.com), which has hoverable footnotes.*";

describe("substack_intro frontmatter", () => {
  it("quotes markdown so YAML parsers read it as a string", () => {
    const fm = writeSubstackIntro("---\ntitle: X\n---\n", INTRO);
    expect(fm).toContain('substack_intro: "*Crossposted');
    expect(parseSubstackIntro(fm)).toBe(INTRO);
    expect(substackIntroFromMarkdown(`${fm}\nBody\n`)).toBe(INTRO);
  });

  it("leaves plain text unquoted and removes the key when cleared", () => {
    const fm = writeSubstackIntro("---\ntitle: X\n---\n", "Crossposted from my site.");
    expect(fm).toContain("substack_intro: Crossposted from my site.\n");
    expect(writeSubstackIntro(fm, "  ")).not.toContain("substack_intro");
  });
});

describe("markers copy with an intro", () => {
  const options = { ...DEFAULT_MARKERS_OPTIONS, intro: INTRO };

  it("goes after a leading image, followed by a divider", () => {
    const md = "![Cover](https://a.b/c.png)\n\nBody.[^1]\n\n[^1]: Note.\n";
    const { html } = htmlForPublishTarget(md, "markers", options);
    const img = html.indexOf("<img");
    const intro = html.indexOf("Crossposted");
    const hr = html.indexOf("<hr>");
    const body = html.indexOf("Body");
    expect(img).toBeGreaterThanOrEqual(0);
    expect(img).toBeLessThan(intro);
    expect(intro).toBeLessThan(hr);
    expect(hr).toBeLessThan(body);
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("<em>");
  });

  it("goes at the top when the essay opens with text", () => {
    const { html } = htmlForPublishTarget("Body.\n", "markers", options);
    expect(html.indexOf("Crossposted")).toBeLessThan(html.indexOf("<hr>"));
    expect(html.indexOf("<hr>")).toBeLessThan(html.indexOf("Body"));
  });

  it("is left out of other copies", () => {
    const { html } = htmlForPublishTarget("Body.\n", "markers");
    expect(html).not.toContain("<hr>");
  });
});
