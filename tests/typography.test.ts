import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { createExtensions } from "@/lib/editor/extensions";
import { parseBody, serializeBody } from "@/lib/markdown/pipeline";
import { LDQ } from "@/lib/editor/smartQuotes";
import {
  lockInputRuleUndo,
  peekUndoableInputRule,
} from "@/lib/editor/undoReplace";

function makeEditor(
  body = "",
  options: { typography?: boolean; typographyLockAfterMs?: number } = {}
): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: createExtensions({
      typography: options.typography ?? true,
      typographyLockAfterMs: options.typographyLockAfterMs ?? 0,
    }),
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

describe("typography input rules", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("turns -- into an em dash and ... into an ellipsis", () => {
    editor = makeEditor("");
    typeText(editor, "Wait--really...");
    const md = serializeBody(editor.getJSON());
    expect(md).toContain("Wait\u2014really\u2026");
  });

  it("turns (c) into the copyright sign", () => {
    editor = makeEditor("");
    typeText(editor, "(c)");
    expect(serializeBody(editor.getJSON())).toContain("\u00A9");
  });

  it("does not apply replacements when typography is off", () => {
    editor = makeEditor("", { typography: false });
    typeText(editor, `"Hi" -- ...`);
    const md = serializeBody(editor.getJSON());
    expect(md).toContain('"Hi"');
    expect(md).toContain("--");
    expect(md).toContain("...");
  });
});

describe("undo-replace", () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("turns a smart quote back into a straight quote on immediate Backspace", () => {
    editor = makeEditor("");
    typeText(editor, `"`);
    expect(editor.getText()).toBe(LDQ);
    expect(peekUndoableInputRule(editor.state)).toBeTruthy();
    editor.commands.keyboardShortcut("Backspace");
    expect(editor.getText()).toBe('"');
  });

  it("turns an em dash back into -- on immediate Backspace", () => {
    editor = makeEditor("");
    typeText(editor, "--");
    expect(editor.getText()).toBe("\u2014");
    editor.commands.keyboardShortcut("Backspace");
    expect(editor.getText()).toBe("--");
  });

  it("Mod-z reverts the substitution instead of deleting the character", () => {
    editor = makeEditor("");
    typeText(editor, `"`);
    expect(editor.getText()).toBe(LDQ);
    editor.commands.keyboardShortcut("Mod-z");
    expect(editor.getText()).toBe('"');
  });

  it("locks after further typing so Backspace cannot revert the quote", () => {
    editor = makeEditor("");
    typeText(editor, `"H`);
    expect(editor.getText()).toBe(`${LDQ}H`);
    expect(peekUndoableInputRule(editor.state)).toBeNull();
    expect(editor.commands.undoInputRule()).toBe(false);
  });

  it("locks after the timeout so the substitution cannot be reverted", async () => {
    vi.useFakeTimers();
    editor = makeEditor("", { typographyLockAfterMs: 40 });
    typeText(editor, `"`);
    expect(editor.getText()).toBe(LDQ);
    await vi.advanceTimersByTimeAsync(60);
    expect(editor.getText()).toBe(LDQ);
    expect(peekUndoableInputRule(editor.state)).toBeNull();
    expect(editor.commands.undoInputRule()).toBe(false);
    vi.useRealTimers();
  });

  it("lockInputRuleUndo expires a pending revert without changing text", () => {
    editor = makeEditor("");
    typeText(editor, `"`);
    expect(editor.getText()).toBe(LDQ);
    expect(lockInputRuleUndo(editor)).toBe(true);
    expect(editor.getText()).toBe(LDQ);
    expect(peekUndoableInputRule(editor.state)).toBeNull();
    expect(editor.commands.undoInputRule()).toBe(false);
  });
});
