import { describe, expect, it } from "vitest";
import { htmlForPublishTarget } from "@/lib/export/clipboardHtml";
import { htmlToPlainText } from "@/lib/export/htmlPlain";
import { SUBSTACK_FOOTNOTE_HELPER } from "@/lib/export/substackEditorHelper";

const SAMPLE = `---
title: Clipboard sample
---

Hello[^1].

[^1]: A cited claim.
`;

describe("htmlForPublishTarget", () => {
  it("emits paste-safe superscripts and a Notes list, not native-looking anchors", () => {
    const { title, html, plain } = htmlForPublishTarget(SAMPLE, "superscripts");
    expect(title).toBe("Clipboard sample");
    expect(html).not.toContain("<h1>");
    expect(html).toContain("<sup>1</sup>");
    expect(html).toContain("A cited claim.");
    expect(html).toMatch(/<p>Notes<\/p>/);
    expect(html).toContain("<ol>");
    expect(html).not.toContain("footnote-anchor");
    expect(html).not.toContain("href=\"#footnote-");
    expect(html).not.toContain("preview-fn-tip");
    expect(html).not.toContain("preview-fn-ref");
    expect(plain).toContain("Hello");
    expect(plain).toContain("A cited claim.");
    expect(plain).not.toContain("[^1]");
  });

  it("treats the older Substack and Medium ids as superscripts", () => {
    const modern = htmlForPublishTarget(SAMPLE, "superscripts").html;
    expect(htmlForPublishTarget(SAMPLE, "substack").html).toBe(modern);
    expect(htmlForPublishTarget(SAMPLE, "medium").html).toBe(modern);
    expect(modern).toContain("<sup>1</sup>");
    expect(modern).not.toContain("href=\"#fn-");
  });

  it("emits linked HTML endnotes and includes the title", () => {
    const { html } = htmlForPublishTarget(SAMPLE, "html");
    expect(html).toContain("<h1>Clipboard sample</h1>");
    expect(html).toContain("<sup>");
    expect(html).toContain('href="#fn-1"');
    expect(html).toContain('id="fnref-1"');
    expect(html).toContain('id="fn-1"');
    expect(html).toContain("A cited claim.");
    expect(html).toContain("↩");
    expect(html).not.toContain("preview-fn-tip");
  });

  it("emits [1] markers and a Notes list for the Substack editor helper", () => {
    const { html, plain } = htmlForPublishTarget(SAMPLE, "markers");
    expect(html).not.toContain("<h1>");
    expect(html).toContain("[1]");
    expect(html).not.toContain("<sup>");
    expect(html).toMatch(/<p>Notes<\/p>/);
    expect(html).toContain("<ol>");
    expect(html).toContain("A cited claim.");
    expect(html).not.toContain("footnote-anchor");
    expect(plain).toContain("[1]");
    expect(plain).toContain("A cited claim.");
    expect(htmlForPublishTarget(SAMPLE, "substack-native").html).toBe(html);
  });
});

describe("htmlToPlainText", () => {
  it("turns block tags into line breaks and drops markup", () => {
    expect(htmlToPlainText("<p>Hello <em>world</em>.</p><p>Next</p>")).toBe(
      "Hello world.\nNext"
    );
  });
});

describe("SUBSTACK_FOOTNOTE_HELPER", () => {
  it("is a self-contained insertFootnote script (no remote load)", () => {
    expect(SUBSTACK_FOOTNOTE_HELPER).toContain("insertFootnote");
    expect(SUBSTACK_FOOTNOTE_HELPER).toContain(".ProseMirror");
    expect(SUBSTACK_FOOTNOTE_HELPER).not.toContain("http://");
    expect(SUBSTACK_FOOTNOTE_HELPER).not.toContain("https://");
    expect(SUBSTACK_FOOTNOTE_HELPER).toContain("Notes");
  });

  it("uses a marker regex that matches [1] and [^1]", () => {
    const snippet = SUBSTACK_FOOTNOTE_HELPER.match(
      /const m = (\/.+\/)\.exec/
    )?.[1];
    expect(snippet).toBeTruthy();
    const re = new Function(`return ${snippet}`)() as RegExp;
    expect("[1]".match(re)?.[1]).toBe("1");
    expect("[^12]".match(re)?.[1]).toBe("12");
    expect("plain".match(re)).toBeNull();
  });
});
