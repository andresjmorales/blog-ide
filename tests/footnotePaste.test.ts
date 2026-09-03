import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { decodeFootnoteAttr } from "@/lib/editor/footnote";
import { createExtensions } from "@/lib/editor/extensions";
import {
  convertMarkdownFootnoteLinks,
  repairSplitFootnoteMarkdown,
  transformPastedFootnoteHtml,
} from "@/lib/import/footnotePaste";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";

function pastedNoteContent(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return decodeFootnoteAttr(
    doc.querySelector("[data-content]")?.getAttribute("data-content") || ""
  );
}

describe("footnotePaste", () => {
  it("turns Substack-style footnote anchors into data-footnote-ref", () => {
    if (typeof DOMParser === "undefined") {
      expect(transformPastedFootnoteHtml("<p>x</p>")).toBe("<p>x</p>");
      return;
    }
    const html = `
      <p>Claim<a class="footnote-anchor" href="#footnote-1" id="footnote-anchor-1">1</a>.</p>
      <div class="footnote" id="footnote-1">
        <a href="#footnote-anchor-1">1</a>
        <p>The note body.</p>
      </div>
    `;
    const next = transformPastedFootnoteHtml(html);
    expect(next).toContain("data-footnote-ref");
    expect(pastedNoteContent(next)).toContain("The note body");
    expect(next).not.toContain('id="footnote-1"');
    // Back-link must not become a second footnote.
    expect(next.match(/data-footnote-ref/g)?.length).toBe(1);
  });

  it("does not convert definition back-links into footnotes", () => {
    if (typeof DOMParser === "undefined") return;
    const html = `
      <p>Hi<a href="#footnote-1" class="footnote-anchor" id="footnote-anchor-1">1</a></p>
      <ol class="footnotes">
        <li id="footnote-1">
          <a href="#footnote-anchor-1" class="footnote-back">↩</a>
          Supporting detail.
        </li>
      </ol>
    `;
    const next = transformPastedFootnoteHtml(html);
    expect(next.match(/data-footnote-ref/g)?.length).toBe(1);
    expect(pastedNoteContent(next)).toContain("Supporting detail");
    expect(next).not.toContain("footnotes");
  });

  it("preserves links and emphasis inside Substack-style footnote bodies", () => {
    if (typeof DOMParser === "undefined") return;
    const html = `
      <p>Claim<a class="footnote-anchor" href="#footnote-1" id="footnote-anchor-1">1</a>.</p>
      <div class="footnote" id="footnote-1">
        <a href="#footnote-anchor-1">1</a>
        <p>See <a href="https://example.com/doc">the source</a> and
        <em>note</em> the <strong>emphasis</strong>.</p>
      </div>
    `;
    const next = transformPastedFootnoteHtml(html);
    expect(next).toContain("data-footnote-ref");
    const content = pastedNoteContent(next);
    expect(content).toContain("[the source](https://example.com/doc)");
    expect(content).toContain("*note*");
    expect(content).toContain("**emphasis**");
    expect(next.match(/data-footnote-ref/g)?.length).toBe(1);
  });

  it("preserves bullets and emphasis in pasted HTML footnote bodies", () => {
    if (typeof DOMParser === "undefined") return;
    const html = `
      <p>Claim<a class="footnote-anchor" href="#footnote-1" id="footnote-anchor-1">1</a>.</p>
      <div class="footnote" id="footnote-1">
        <a href="#footnote-anchor-1">1</a>
        <p>See these:</p>
        <ul>
          <li>first <strong>item</strong></li>
          <li><em>second</em></li>
        </ul>
      </div>
    `;
    const next = transformPastedFootnoteHtml(html);
    const content = pastedNoteContent(next);
    expect(content).toContain("See these:");
    expect(content).toMatch(/- first \*\*item\*\*/);
    expect(content).toMatch(/- \*second\*/);

    const editor = new Editor({
      extensions: createExtensions(),
      content: next,
      contentType: "html",
    });
    try {
      let note = "";
      editor.state.doc.descendants((node) => {
        if (node.type.name === "footnoteRef") {
          note = String(node.attrs.content ?? "");
        }
      });
      expect(note).toContain("first **item**");
      expect(note).toContain("*second*");
    } finally {
      editor.destroy();
    }
  });

  it("converts markdown footnote hyperlinks to GFM", () => {
    const md = "A claim[1](#footnote-1).\n\n1. Supporting detail.\n";
    const { markdown, converted } = convertMarkdownFootnoteLinks(md);
    expect(converted).toBe(1);
    expect(markdown).toContain("[^1]");
    expect(markdown).toContain("[^1]: Supporting detail.");
  });

  it("repairs split bare [^n] markers + trailing note bodies", () => {
    const md = [
      "Claim one.[^1] Claim two.[^2]",
      "",
      "## Still essay",
      "",
      "More prose.[^3]",
      "",
      "[^1]",
      "",
      "First note with a [link](https://example.com).",
      "",
      "[^2]",
      "",
      "Second note.",
      "",
      "[^3]",
      "",
      "Third note.",
      "",
    ].join("\n");

    const { markdown, repaired } = repairSplitFootnoteMarkdown(md);
    expect(repaired).toBe(3);
    expect(markdown).toContain("Claim one.[^1]");
    expect(markdown).toContain("[^1]: First note with a [link](https://example.com).");
    expect(markdown).toContain("[^2]: Second note.");
    expect(markdown).toContain("[^3]: Third note.");
    // No leftover bare markers that would double-parse as refs.
    expect(markdown).not.toMatch(/^\[\^1\]\s*$/m);

    const doc = parseBody(markdown.replace(/^---[\s\S]*?---\n/, ""));
    const footnotes: string[] = [];
    const walk = (node: { type?: string; attrs?: { content?: string }; content?: unknown[] }) => {
      if (node.type === "footnoteRef") {
        footnotes.push(String(node.attrs?.content ?? ""));
      }
      for (const child of node.content ?? []) {
        walk(child as typeof node);
      }
    };
    walk(doc);
    expect(footnotes).toHaveLength(3);
    expect(footnotes[0]).toContain("First note");
    expect(serializeBody(doc)).toContain("[^1]: First note");
  });

  it("repairs the Substack example fixture without doubling notes", () => {
    const fixture = readFileSync(
      resolve(__dirname, "fixtures/import/substack-footnotes-example.md"),
      "utf8"
    );
    const { markdown, converted } = convertMarkdownFootnoteLinks(fixture);
    expect(converted).toBe(24);

    const body = markdown.replace(/^---[\s\S]*?---\n/, "");
    const bareTrailers = body
      .split("\n")
      .filter((line) => /^\[\^[^\]]+\]\s*:?\s*$/.test(line));
    expect(bareTrailers).toHaveLength(0);

    const defCount = [...body.matchAll(/^\[\^[^\]]+\]:/gm)].length;
    expect(defCount).toBe(24);

    const refCount = [...body.matchAll(/\[\^[^\]]+\]/g)].length;
    // 24 refs in prose + 24 definition lines = 48 [^n] occurrences, not 72.
    expect(refCount).toBe(48);

    const doc = parseBody(body);
    let footnoteAtoms = 0;
    const walk = (node: { type?: string; content?: unknown[] }) => {
      if (node.type === "footnoteRef") footnoteAtoms += 1;
      for (const child of node.content ?? []) {
        walk(child as typeof node);
      }
    };
    walk(doc);
    expect(footnoteAtoms).toBe(24);
  });
});
