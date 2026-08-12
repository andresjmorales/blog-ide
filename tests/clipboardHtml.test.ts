import { describe, expect, it } from "vitest";
import { htmlForPublishTarget } from "@/lib/export/clipboardHtml";

const SAMPLE = `---
title: Clipboard sample
---

Hello[^1].

[^1]: A cited claim.
`;

describe("htmlForPublishTarget", () => {
  it("emits Substack-style footnote anchors and strips hover tips", () => {
    const { title, html } = htmlForPublishTarget(SAMPLE, "substack");
    expect(title).toBe("Clipboard sample");
    expect(html).toContain("<h1>Clipboard sample</h1>");
    expect(html).toContain('class="footnote-anchor"');
    expect(html).toContain('href="#footnote-1"');
    expect(html).toContain('id="footnote-1"');
    expect(html).toContain("A cited claim.");
    expect(html).not.toContain("preview-fn-tip");
    expect(html).not.toContain("preview-fn-ref");
  });

  it("emits Medium superscripts and an ordered endnotes list", () => {
    const { html } = htmlForPublishTarget(SAMPLE, "medium");
    expect(html).toContain("<h1>Clipboard sample</h1>");
    expect(html).toContain("<sup>");
    expect(html).toContain('href="#fn-1"');
    expect(html).toContain('id="fnref-1"');
    expect(html).toContain('id="fn-1"');
    expect(html).toContain("A cited claim.");
    expect(html).toContain("↩");
    expect(html).not.toContain("footnote-anchor");
    expect(html).not.toContain("preview-fn-tip");
  });
});
