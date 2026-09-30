import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody } from "@/lib/markdown/pipeline";
import {
  createAnchor,
  projectText,
  resolveAnchor,
  resolveAnchorOffsets,
  type CommentAnchor,
} from "@/lib/comments/anchors";
import { footnoteDocFromMarkdown } from "@/lib/comments/footnoteText";

const schema = getSchema(createExtensions());

function doc(markdown: string): PMNode {
  return schema.nodeFromJSON(parseBody(markdown));
}

/** Document range of the n-th occurrence of `needle`. */
function rangeOf(d: PMNode, needle: string, nth = 0) {
  const { text } = projectText(d);
  let at = -1;
  for (let i = 0; i <= nth; i++) at = text.indexOf(needle, at + 1);
  if (at === -1) throw new Error(`missing ${needle}`);
  let from = -1;
  let to = -1;
  d.descendants((node, pos) => {
    if (!node.isText) return;
    const { segments } = projectText(d);
    const seg = segments.find((s) => s.pos === pos)!;
    if (from === -1 && at >= seg.start && at < seg.start + seg.length) {
      from = pos + (at - seg.start);
    }
    const end = at + needle.length;
    if (end > seg.start && end <= seg.start + seg.length) {
      to = pos + (end - seg.start);
    }
  });
  return { from, to };
}

function anchorFor(d: PMNode, needle: string, nth = 0): CommentAnchor {
  const { from, to } = rangeOf(d, needle, nth);
  const anchor = createAnchor(d, from, to);
  if (!anchor) throw new Error("no anchor");
  return anchor;
}

function resolvedText(d: PMNode, anchor: CommentAnchor): string | null {
  const range = resolveAnchor(d, anchor);
  return range ? d.textBetween(range.from, range.to, "\n") : null;
}

describe("comment anchors", () => {
  const base =
    "# Title\n\nThe quick brown fox jumps over the lazy dog.\n\nSecond paragraph with **bold words** inside.\n";

  it("round-trips a selection in the same doc", () => {
    const d = doc(base);
    const anchor = anchorFor(d, "brown fox");
    expect(anchor.quote).toBe("brown fox");
    expect(anchor.prefix.endsWith("The quick ")).toBe(true);
    expect(anchor.suffix.startsWith(" jumps")).toBe(true);
    expect(resolvedText(d, anchor)).toBe("brown fox");
  });

  it("spans marks and paragraphs", () => {
    const d = doc(base);
    const anchor = anchorFor(d, "lazy dog.\nSecond paragraph with bold");
    expect(resolvedText(d, anchor)).toBe("lazy dog.\nSecond paragraph with bold");
  });

  it("trims whitespace and refuses empty selections", () => {
    const d = doc(base);
    const { from, to } = rangeOf(d, " brown ");
    expect(createAnchor(d, from, to)?.quote).toBe("brown");
    const space = rangeOf(d, " ");
    expect(createAnchor(d, space.from, space.to)).toBeNull();
  });

  it("survives edits before the quote", () => {
    const anchor = anchorFor(doc(base), "lazy dog");
    const edited = doc(base.replace("# Title", "# A much longer title than before"));
    expect(resolveAnchor(edited, anchor)?.kind).toBe("exact");
    expect(resolvedText(edited, anchor)).toBe("lazy dog");
  });

  it("survives edits after the quote", () => {
    const anchor = anchorFor(doc(base), "quick brown");
    const edited = doc(`${base}\nA new closing paragraph.\n`);
    expect(resolvedText(edited, anchor)).toBe("quick brown");
  });

  it("follows edits inside the quote (fuzzy)", () => {
    const anchor = anchorFor(doc(base), "brown fox jumps");
    const edited = doc(base.replace("brown fox jumps", "red fox leaps"));
    const range = resolveAnchor(edited, anchor);
    expect(range?.kind).toBe("fuzzy");
    expect(resolvedText(edited, anchor)).toBe("red fox leaps");
  });

  it("uses the quote's ends when the context changed too", () => {
    const text =
      "Alpha beta. Nobody expects the Spanish inquisition to arrive today. Omega.";
    const anchor: CommentAnchor = {
      scope: "body",
      quote: "Nobody expects the Spanish inquisition to arrive today",
      prefix: "Alpha beta. ",
      suffix: ". Omega.",
      hint: 12,
    };
    const edited =
      "Changed start! Nobody expects the famous Spanish inquisition to arrive today. Changed end";
    const match = resolveAnchorOffsets(edited, anchor);
    expect(match?.kind).toBe("fuzzy");
    expect(edited.slice(match!.start, match!.end)).toBe(
      "Nobody expects the famous Spanish inquisition to arrive today"
    );
    expect(resolveAnchorOffsets(text, anchor)?.kind).toBe("exact");
  });

  it("disambiguates repeated phrases by context, then hint", () => {
    const md =
      "I said yes. Then she said yes too.\n\nLater everyone said yes.\n";
    const d = doc(md);
    const second = anchorFor(d, "said yes", 1);
    expect(second.prefix.endsWith("Then she ")).toBe(true);
    // Insert another "said yes" before all of them: context still picks it.
    const edited = doc(`He said yes first.\n\n${md}`);
    const range = resolveAnchor(edited, second)!;
    const { text } = projectText(edited);
    const before = edited.textBetween(0, range.from, "\n");
    expect(text.includes("Then she said yes")).toBe(true);
    expect(before.endsWith("Then she ")).toBe(true);
  });

  it("uses the hint when context is identical", () => {
    const text = "na na na na";
    const anchor: CommentAnchor = {
      scope: "body",
      quote: "na",
      prefix: "",
      suffix: "",
      hint: 6,
    };
    expect(resolveAnchorOffsets(text, anchor)?.start).toBe(6);
  });

  it("detaches when the quote is deleted", () => {
    const anchor = anchorFor(doc(base), "brown fox");
    const edited = doc(base.replace("brown fox ", ""));
    expect(resolveAnchor(edited, anchor)).toBeNull();
  });

  it("detaches when everything around it is gone", () => {
    const anchor = anchorFor(doc(base), "bold words");
    expect(resolveAnchor(doc("Totally different essay.\n"), anchor)).toBeNull();
  });

  it("skips footnote markers in body text", () => {
    const md = "Before the note[[blogide-fn:n1:Note_20text]] and after it.\n";
    const d = doc(md);
    expect(projectText(d).text).toBe("Before the note and after it.");
    const anchor = anchorFor(d, "note and after");
    expect(resolveAnchor(d, anchor)).not.toBeNull();
  });

  it("anchors inside footnote text", () => {
    const note = footnoteDocFromMarkdown(
      "See *Smith 2020*, p. 12, for the original argument."
    );
    const { text } = projectText(note);
    expect(text).toBe("See Smith 2020, p. 12, for the original argument.");
    const start = text.indexOf("original");
    let from = 0;
    note.descendants((node, pos) => {
      if (node.isText && node.text?.includes("original")) {
        from = pos + node.text.indexOf("original");
      }
    });
    const anchor = createAnchor(note, from, from + "original".length, "footnote", "n1")!;
    expect(anchor).toMatchObject({ scope: "footnote", footnoteId: "n1", hint: start });
    const edited = footnoteDocFromMarkdown(
      "Also see Jones. See *Smith 2020*, p. 12, for the original argument."
    );
    const range = resolveAnchor(edited, anchor)!;
    expect(edited.textBetween(range.from, range.to)).toBe("original");
  });
});
