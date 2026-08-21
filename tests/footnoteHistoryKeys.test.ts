import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { createFootnoteExtensions } from "@/lib/editor/footnoteSchema";
import {
  applyFootnoteHistoryKey,
  footnoteHistoryAction,
  isFootnoteHistoryTarget,
} from "@/lib/editor/footnoteHistoryKeys";

function key(
  keyName: string,
  mods: { ctrl?: boolean; shift?: boolean; meta?: boolean; alt?: boolean } = {}
): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: keyName,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
    bubbles: true,
    cancelable: true,
  });
}

describe("footnoteHistoryAction", () => {
  it("maps Ctrl/Cmd+Z and redo chords", () => {
    expect(footnoteHistoryAction(key("z", { ctrl: true }))).toBe("undo");
    expect(footnoteHistoryAction(key("z", { meta: true }))).toBe("undo");
    expect(footnoteHistoryAction(key("z", { ctrl: true, shift: true }))).toBe(
      "redo"
    );
    expect(footnoteHistoryAction(key("y", { ctrl: true }))).toBe("redo");
    expect(footnoteHistoryAction(key("z"))).toBeNull();
    expect(footnoteHistoryAction(key("z", { ctrl: true, alt: true }))).toBeNull();
  });
});

describe("isFootnoteHistoryTarget", () => {
  it("accepts the matching card and ignores inputs", () => {
    const card = document.createElement("div");
    card.className = "footnote-pin";
    card.setAttribute("data-footnote-id", "fn-1");
    const editor = document.createElement("div");
    card.appendChild(editor);
    document.body.appendChild(card);
    try {
      expect(isFootnoteHistoryTarget(editor, "fn-1")).toBe(true);
      expect(isFootnoteHistoryTarget(editor, "fn-other")).toBe(false);
      const input = document.createElement("input");
      card.appendChild(input);
      expect(isFootnoteHistoryTarget(input, "fn-1")).toBe(false);
    } finally {
      card.remove();
    }
  });
});

describe("applyFootnoteHistoryKey", () => {
  it("undoes and redoes in the nested footnote editor", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: createFootnoteExtensions({ typography: false }),
      content: "Hello",
      contentType: "markdown",
    });
    try {
      editor.commands.insertContent(" world");
      expect(applyFootnoteHistoryKey(editor, "undo")).toBe(true);
      expect(editor.getText()).not.toContain("world");
      expect(applyFootnoteHistoryKey(editor, "redo")).toBe(true);
      expect(editor.getText()).toContain("world");
    } finally {
      editor.destroy();
    }
  });
});
