import { describe, expect, it } from "vitest";
import { clipboardHtmlFromMarkdown } from "@/lib/export/clipboardHtml";

describe("clipboardHtmlFromMarkdown", () => {
  it("emits Substack-style footnote anchors and strips hover tips", () => {
    const markdown = `---
title: Clipboard sample
---

Hello[^1].

[^1]: A cited claim.
`;
    const { title, html } = clipboardHtmlFromMarkdown(markdown);
    expect(title).toBe("Clipboard sample");
    expect(html).toContain("<h1>Clipboard sample</h1>");
    expect(html).toContain('class="footnote-anchor"');
    expect(html).toContain('href="#footnote-1"');
    expect(html).toContain('id="footnote-1"');
    expect(html).toContain("A cited claim.");
    expect(html).not.toContain("preview-fn-tip");
    expect(html).not.toContain("preview-fn-ref");
  });
});
