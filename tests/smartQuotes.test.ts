import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { createFootnoteExtensions } from "@/lib/editor/footnoteSchema";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import { curlyQuoteFor, LDQ, LSQ, RDQ, RSQ } from "@/lib/editor/smartQuotes";

function makeEditor(body = "", smartQuotes = true): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions({ smartQuotes }),
    content: parseBody(body),
  });
}

/**
 * Type through handleTextInput so ProseMirror input rules run.
 * tr.insertText / insertContent bypass those handlers.
 */
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

describe("curlyQuoteFor (Docs-style context)", () => {
  it("opens after start, space, and opening punctuation", () => {
    expect(curlyQuoteFor('"', "")).toBe(LDQ);
    expect(curlyQuoteFor('"', " ")).toBe(LDQ);
    expect(curlyQuoteFor('"', "(")).toBe(LDQ);
    expect(curlyQuoteFor('"', "—")).toBe(LDQ);
    expect(curlyQuoteFor("'", "")).toBe(LSQ);
  });

  it("closes after letters and uses apostrophes in contractions", () => {
    expect(curlyQuoteFor('"', "o")).toBe(RDQ);
    expect(curlyQuoteFor("'", "n")).toBe(RSQ);
    expect(curlyQuoteFor('"', LDQ)).toBe(RDQ);
  });
});

describe("SmartQuotes input rules", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("turns typed quotes into opening then closing pairs", () => {
    editor = makeEditor("");
    typeText(editor, `"Hello"`);
    const md = serializeBody(editor.getJSON());
    expect(md).toContain(`${LDQ}Hello${RDQ}`);
    expect(md).not.toContain('"');
  });

  it("uses a right single quote for contractions", () => {
    editor = makeEditor("");
    typeText(editor, "It's");
    expect(serializeBody(editor.getJSON())).toContain(`It${RSQ}s`);
  });

  it("converts a leading single quote plus digit into an apostrophe", () => {
    editor = makeEditor("");
    typeText(editor, "'90s");
    expect(serializeBody(editor.getJSON())).toContain(`${RSQ}90s`);
  });

  it("leaves straight quotes alone inside a code block", () => {
    editor = makeEditor("");
    editor.commands.setCodeBlock();
    typeText(editor, `"hello"`);
    expect(serializeBody(editor.getJSON())).toContain('"hello"');
  });

  it("leaves straight quotes alone in inline code", () => {
    editor = makeEditor("");
    editor.commands.toggleCode();
    typeText(editor, `"x"`);
    expect(serializeBody(editor.getJSON())).toMatch(/`"x"`/);
  });

  it("applies in nested footnote editors", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const note = new Editor({
      element,
      extensions: createFootnoteExtensions(),
      content: "",
      contentType: "markdown",
    });
    try {
      typeText(note, `"Hi"`);
      expect(note.getText()).toContain(`${LDQ}Hi${RDQ}`);
    } finally {
      note.destroy();
    }
  });

  it("leaves straight quotes when the setting is off", () => {
    editor = makeEditor("", false);
    typeText(editor, `"Hello"`);
    expect(serializeBody(editor.getJSON())).toContain('"Hello"');
  });

  it("leaves straight quotes in footnotes when the setting is off", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const note = new Editor({
      element,
      extensions: createFootnoteExtensions({ smartQuotes: false }),
      content: "",
      contentType: "markdown",
    });
    try {
      typeText(note, `"Hi"`);
      expect(note.getText()).toContain('"Hi"');
    } finally {
      note.destroy();
    }
  });
});
