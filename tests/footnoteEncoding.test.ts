import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import {
  decodeFootnoteValue,
  encodeFootnoteValue,
} from "@/lib/editor/footnote";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import { transformPastedFootnoteHtml } from "@/lib/import/footnotePaste";

function footnotesIn(doc: {
  type?: string;
  attrs?: { content?: string };
  content?: unknown[];
}) {
  const found: Array<{ content: string }> = [];
  const visit = (node: typeof doc) => {
    if (node.type === "footnoteRef") {
      found.push({ content: String(node.attrs?.content ?? "") });
    }
    for (const child of node.content ?? []) {
      visit(child as typeof doc);
    }
  };
  visit(doc);
  return found;
}

/** Exact Substack FootnoteToDOM shape from the ai-sentience essay. */
const SUBSTACK_HTML = `
<p>Disclaimer.<a data-component-name="FootnoteAnchorToDOM" id="footnote-anchor-1" href="#footnote-1" class="footnote-anchor">1</a>
 later.<a data-component-name="FootnoteAnchorToDOM" id="footnote-anchor-2" href="#footnote-2" class="footnote-anchor">2</a></p>
<div data-component-name="FootnoteToDOM" class="footnote">
  <a id="footnote-1" href="#footnote-anchor-1" contenteditable="false" class="footnote-number">1</a>
  <div class="footnote-content">
    <p><a href="https://docs.google.com/document/d/1vi50Ebmdw8V2E7rGzMPaRgBU_p8pIt1BWVdAONJOeX0">Link to sources and further reading</a><span>.</span></p>
  </div>
</div>
<div data-component-name="FootnoteToDOM" class="footnote">
  <a id="footnote-2" href="#footnote-anchor-2" contenteditable="false" class="footnote-number">2</a>
  <div class="footnote-content">
    <p><span>Anthis, J. R. (2018). </span><a href="https://www.sentienceinstitute.org/blog/what-is-sentience">What is sentience?</a><span> </span><em>Sentience Institute</em><span>.</span></p>
  </div>
</div>
`;

describe("footnote value encoding", () => {
  it("round-trips Google Docs URLs that contain underscores", () => {
    const content =
      "[Link to sources and further reading.](https://docs.google.com/document/d/1vi50Ebmdw8V2E7rGzMPaRgBU_p8pIt1BWVdAONJOeX0).";
    const encoded = encodeFootnoteValue(content);
    expect(encoded).toMatch(/^[A-Za-z0-9._~-]*$/);
    expect(decodeFootnoteValue(encoded)).toBe(content);
  });

  it("still decodes legacy sentinels that left underscores literal", () => {
    // Old encoder: encodeURIComponent + %→_ without encoding `_` first.
    const legacy = encodeURIComponent(
      "[x](https://docs.google.com/document/d/1vi50Ebmdw8V2E7rGzMPaRgBU_p8pIt1BWVdAONJOeX0)"
    )
      .replace(/[!'()*]/g, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`
      )
      .replace(/%/g, "_");
    expect(legacy).toContain("BU_p8p");
    expect(decodeFootnoteValue(legacy)).toContain("BU_p8p");
  });
});

describe("Substack FootnoteToDOM paste (ai-sentience)", () => {
  it("preserves link-only footnote 1 through paste + serialize", () => {
    const transformed = transformPastedFootnoteHtml(SUBSTACK_HTML);
    expect(transformed).toContain("Link to sources");

    const editor = new Editor({
      extensions: createExtensions(),
      content: transformed,
      contentType: "html",
    });
    const notes = footnotesIn(editor.getJSON());
    const md = serializeBody(editor.getJSON());
    editor.destroy();

    expect(notes[0]?.content).toContain("Link to sources");
    expect(notes[0]?.content).toContain("BU_p8p");
    expect(notes[1]?.content).toContain("Anthis");
    expect(md).toMatch(/\[\^1\]:.*Link to sources/);
    expect(md).toContain("BU_p8p");
    expect(footnotesIn(parseBody(md))[0]?.content).toContain("Link to sources");
  });
});
