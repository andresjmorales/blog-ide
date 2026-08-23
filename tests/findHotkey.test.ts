import { describe, expect, it } from "vitest";
import {
  isFindHotkeyTarget,
  isFindReplaceHotkey,
  isInsertFootnoteHotkey,
} from "@/lib/editor/findHotkey";

function event(partial: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}) {
  return {
    key: partial.key,
    metaKey: partial.metaKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    altKey: partial.altKey ?? false,
    shiftKey: partial.shiftKey ?? false,
  };
}

describe("find vs footnote hotkeys", () => {
  it("treats Ctrl/Cmd+F without Shift as find", () => {
    expect(isFindReplaceHotkey(event({ key: "f", ctrlKey: true }))).toBe(true);
    expect(isFindReplaceHotkey(event({ key: "F", metaKey: true }))).toBe(true);
    expect(isFindReplaceHotkey(event({ key: "h", ctrlKey: true }))).toBe(true);
    expect(isInsertFootnoteHotkey(event({ key: "f", ctrlKey: true }))).toBe(
      false
    );
  });

  it("treats Ctrl/Cmd+Shift+F as insert footnote, not find", () => {
    const chord = event({ key: "F", ctrlKey: true, shiftKey: true });
    expect(isFindReplaceHotkey(chord)).toBe(false);
    expect(isInsertFootnoteHotkey(chord)).toBe(true);
    expect(
      isInsertFootnoteHotkey(event({ key: "f", metaKey: true, shiftKey: true }))
    ).toBe(true);
  });

  it("ignores Alt and unmodified F", () => {
    expect(
      isInsertFootnoteHotkey(
        event({ key: "f", ctrlKey: true, shiftKey: true, altKey: true })
      )
    ).toBe(false);
    expect(isFindReplaceHotkey(event({ key: "f" }))).toBe(false);
  });

  it("claims Ctrl+F from a portaled footnote card, not from chrome inputs", () => {
    const shell = document.createElement("div");
    const essay = document.createElement("div");
    essay.contentEditable = "true";
    shell.appendChild(essay);
    document.body.appendChild(shell);

    const card = document.createElement("div");
    card.className = "footnote-pin";
    const note = document.createElement("div");
    note.contentEditable = "true";
    card.appendChild(note);
    document.body.appendChild(card);

    const ai = document.createElement("textarea");
    document.body.appendChild(ai);

    try {
      expect(isFindHotkeyTarget(essay, shell)).toBe(true);
      expect(isFindHotkeyTarget(note, shell)).toBe(true);
      expect(isFindHotkeyTarget(ai, shell)).toBe(false);
      expect(isFindHotkeyTarget(document.body, shell)).toBe(true);
    } finally {
      shell.remove();
      card.remove();
      ai.remove();
    }
  });
});
