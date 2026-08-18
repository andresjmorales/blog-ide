import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import {
  applyLinkHrefAndText,
  isNakedLink,
  readLinkDisplayText,
  resolveLinkShortcutFocusField,
} from "@/lib/editor/linkFields";

function makeEditor(body: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

describe("isNakedLink", () => {
  it("treats matching visible URL and href as naked", () => {
    expect(isNakedLink("https://example.com", "https://example.com")).toBe(
      true
    );
    expect(isNakedLink("example.com", "https://example.com")).toBe(true);
  });

  it("treats a named label as not naked", () => {
    expect(isNakedLink("Example", "https://example.com")).toBe(false);
  });
});

describe("link display text and apply", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("reads the current visible text of an existing link", () => {
    editor = makeEditor("[Example](https://example.com)\n");
    editor.commands.setTextSelection(2);
    expect(readLinkDisplayText(editor)).toBe("Example");
    expect(resolveLinkShortcutFocusField(editor)).toBe("url");
  });

  it("focuses the text field for a naked pasted URL", () => {
    editor = makeEditor("[https://example.com](https://example.com)\n");
    editor.commands.setTextSelection(2);
    expect(resolveLinkShortcutFocusField(editor)).toBe("text");
  });

  it("focuses the URL field when wrapping selected prose", () => {
    editor = makeEditor("Hello world\n");
    editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(readLinkDisplayText(editor)).toBe("Hello");
    expect(resolveLinkShortcutFocusField(editor)).toBe("url");
  });

  it("replaces visible text and keeps the href", () => {
    editor = makeEditor("[https://example.com](https://example.com)\n");
    editor.commands.setTextSelection(2);
    applyLinkHrefAndText(editor, "https://example.com", "Example");
    expect(serializeBody(editor.getJSON())).toContain(
      "[Example](https://example.com)"
    );
  });

  it("wraps a selection with href without changing the words", () => {
    editor = makeEditor("Hello world\n");
    editor.commands.setTextSelection({ from: 1, to: 6 });
    applyLinkHrefAndText(editor, "https://example.com/path", "Hello");
    expect(serializeBody(editor.getJSON())).toContain(
      "[Hello](https://example.com/path)"
    );
    expect(editor.getText()).toBe("Hello world");
  });

  it("inserts labeled text when the caret is empty", () => {
    editor = makeEditor("Hi\n");
    editor.commands.focus("end");
    applyLinkHrefAndText(editor, "https://example.com", "Source");
    expect(serializeBody(editor.getJSON())).toContain(
      "[Source](https://example.com)"
    );
  });
});
