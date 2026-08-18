import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { createFootnoteExtensions } from "@/lib/editor/footnoteSchema";
import { parseBody } from "@/lib/markdown/pipeline";
import {
  promptForLink,
  setLinkEditorOpener,
  type LinkEditorOpenOptions,
} from "@/lib/editor/linkShortcut";

function makeEditor(body: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions(),
    content: parseBody(body),
  });
}

describe("promptForLink (Ctrl+K)", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    setLinkEditorOpener(null);
    editor?.destroy();
    editor = null;
  });

  it("opens without preview when there is no href", () => {
    let opts: LinkEditorOpenOptions | undefined;
    let target: Editor | undefined;
    setLinkEditorOpener((ed, options) => {
      target = ed;
      opts = options;
    });
    editor = makeEditor("hello\n");
    promptForLink(editor);
    expect(target).toBe(editor);
    expect(opts?.focusUrl).toBe(true);
    expect(opts?.focusText).toBe(false);
    expect(opts?.allowPreview).toBe(false);
  });

  it("focuses the display-text field for a naked pasted URL", () => {
    let opts: LinkEditorOpenOptions | undefined;
    setLinkEditorOpener((_ed, options) => {
      opts = options;
    });
    editor = makeEditor("[https://example.com](https://example.com)\n");
    editor.commands.setTextSelection(2);
    promptForLink(editor);
    expect(opts?.focusText).toBe(true);
    expect(opts?.focusUrl).toBe(false);
    expect(opts?.allowPreview).toBe(true);
  });

  it("allows preview when the selection is already a link", () => {
    let opts: LinkEditorOpenOptions | undefined;
    setLinkEditorOpener((_ed, options) => {
      opts = options;
    });
    editor = makeEditor("[Example](https://example.com)\n");
    editor.commands.setTextSelection(2);
    promptForLink(editor);
    expect(opts?.allowPreview).toBe(true);
    expect(opts?.href).toContain("example.com");
    expect(opts?.focusUrl).toBe(true);
    expect(opts?.focusText).toBe(false);
  });

  it("targets a nested footnote editor, not the parent", () => {
    let target: Editor | undefined;
    setLinkEditorOpener((ed) => {
      target = ed;
    });
    const element = document.createElement("div");
    document.body.appendChild(element);
    const note = new Editor({
      element,
      extensions: createFootnoteExtensions(),
      content: "See [source](https://example.com)",
      contentType: "markdown",
    });
    try {
      promptForLink(note);
      expect(target).toBe(note);
    } finally {
      note.destroy();
    }
  });
});
