import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import {
  parseNumericPlainTextOrderedListPaste,
  protectZeroPaddedOrderedMarkers,
} from "@/lib/editor/orderedList";
import { jsonFromPastedPlainText } from "@/lib/editor/normalizePastedWhitespace";
import {
  isLossy,
  parseBody,
  roundTrip,
  serializeBody,
} from "@/lib/markdown/pipeline";

function makeEditor(body = ""): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

function typeText(editor: Editor, text: string) {
  editor.commands.focus("end");
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp("handleTextInput", (fn) =>
      fn(editor.view, from, to, char, () =>
        editor.state.tr.insertText(char, from, to)
      )
    );
    if (!handled) {
      editor.view.dispatch(editor.state.tr.insertText(char, from, to));
    }
  }
}

function textOf(doc: ReturnType<typeof parseBody>): string {
  const parts: string[] = [];
  const walk = (node: { type?: string; text?: string; content?: unknown[] }) => {
    if (node.text) parts.push(node.text);
    for (const child of node.content ?? []) {
      walk(child as { type?: string; text?: string; content?: unknown[] });
    }
  };
  walk(doc);
  return parts.join("\n");
}

describe("zero-padded numbered lines stay as text", () => {
  it("does not drop a zero-padded line that follows a canonical list", () => {
    const md = "1. canonical\n02. keep me\n";
    const json = JSON.stringify(parseBody(md));
    expect(json).toContain("canonical");
    expect(json).toContain("keep me");
    expect(serializeBody(parseBody(md))).toContain("keep me");
  });

  it("keeps 01) paren markers as text too", () => {
    const md = "01) first\n02) second\n03) third\n";
    expect(JSON.stringify(parseBody(md))).not.toContain('"type":"orderedList"');
    expect(roundTrip(md)).toBe(md);
  });

  it("does not fold 01./02./03. into a native ordered list", () => {
    const md = "01. first\n02. second\n03. third\n";
    const doc = parseBody(md);
    expect(doc.content?.[0]?.type).toBe("paragraph");
    expect(JSON.stringify(doc)).not.toContain('"type":"orderedList"');
    expect(textOf(doc)).toContain("01. first");
    expect(textOf(doc)).toContain("02. second");
    expect(textOf(doc)).toContain("03. third");
    expect(serializeBody(doc)).toContain("01. first");
    expect(serializeBody(doc)).toContain("02. second");
    expect(serializeBody(doc)).toContain("03. third");
    expect(serializeBody(doc)).not.toMatch(/^1\.\s/m);
    expect(isLossy(md)).toBe(false);
    expect(roundTrip(md)).toBe(md);
  });

  it("keeps blank-line-separated 01./02./03. paragraphs intact", () => {
    const md = "01. first\n\n02. second\n\n03. third\n";
    const doc = parseBody(md);
    expect(JSON.stringify(doc)).not.toContain('"type":"orderedList"');
    expect(doc.content).toHaveLength(3);
    expect(serializeBody(doc).trim()).toBe("01. first\n\n02. second\n\n03. third");
    expect(isLossy(md)).toBe(false);
  });

  it("still parses canonical 1. 2. 3. lists", () => {
    const md = "1. first\n2. second\n3. third\n";
    expect(parseBody(md).content?.[0]?.type).toBe("orderedList");
    expect(isLossy(md)).toBe(false);
  });

  it("still round-trips unpadded lists that start above 1", () => {
    const md = "5. fifth\n6. sixth\n";
    expect(parseBody(md).content?.[0]?.type).toBe("orderedList");
    expect(serializeBody(parseBody(md))).toMatch(/fifth/);
    expect(serializeBody(parseBody(md))).toMatch(/sixth/);
  });

  it("does not escape 01. inside fenced code", () => {
    const md = "```\n01. keep me\n02. also me\n```\n";
    expect(protectZeroPaddedOrderedMarkers(md)).toBe(md);
    expect(roundTrip(md)).toContain("01. keep me");
  });

  it("survives a cloud-refresh parse of a WYSIWYG 01/02/03 draft", () => {
    const editor = makeEditor("");
    try {
      typeText(editor, "01. first");
      editor.commands.enter();
      typeText(editor, "02. second");
      editor.commands.enter();
      typeText(editor, "03. third");
      expect(editor.isActive("orderedList")).toBe(false);
      const saved = serializeBody(editor.getJSON());
      expect(saved).toContain("01. first");
      expect(saved).toContain("02. second");
      expect(saved).toContain("03. third");

      // Conflict / other-device open reloads markdown through parseBody.
      const refreshed = makeEditor(saved);
      try {
        expect(refreshed.isActive("orderedList")).toBe(false);
        const out = serializeBody(refreshed.getJSON());
        expect(out).toContain("01. first");
        expect(out).toContain("02. second");
        expect(out).toContain("03. third");
        expect(out).not.toMatch(/^1\.\s/m);
      } finally {
        refreshed.destroy();
      }
    } finally {
      editor.destroy();
    }
  });
});

describe("zero-padded numbered paste", () => {
  it("does not convert 01./02./03. clipboard text into a native list", () => {
    expect(
      parseNumericPlainTextOrderedListPaste("01. first\n02. second\n03. third\n")
    ).toBeNull();
  });

  it("still converts canonical 1./2./3. clipboard text into a list", () => {
    const pasted = parseNumericPlainTextOrderedListPaste(
      "1. first\n2. second\n3. third\n"
    );
    expect(pasted?.type).toBe("orderedList");
    expect(pasted?.content).toHaveLength(3);
  });

  it("pastes 01./02./03. as paragraphs that keep every line", () => {
    const json = jsonFromPastedPlainText("01. first\n02. second\n03. third\n");
    expect(JSON.stringify(json)).not.toContain('"type":"orderedList"');
    const out = serializeBody(json);
    expect(out).toContain("01. first");
    expect(out).toContain("02. second");
    expect(out).toContain("03. third");
  });
});
