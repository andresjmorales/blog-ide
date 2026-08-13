import { afterEach, describe, expect, it } from "vitest";
import {
  insertIntoTextControl,
  tryInsertIntoTextTarget,
} from "@/lib/editor/textInsertTarget";

describe("textInsertTarget", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("inserts at the caret of a focused textarea", () => {
    const area = document.createElement("textarea");
    area.value = "Hello world";
    document.body.appendChild(area);
    area.focus();
    area.setSelectionRange(5, 5);

    expect(
      tryInsertIntoTextTarget({ text: "—" })
    ).toBe(true);
    expect(area.value).toBe("Hello— world");
    expect(area.selectionStart).toBe(6);
  });

  it("wraps the current selection in an input", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = "deck";
    document.body.appendChild(input);
    input.focus();
    input.setSelectionRange(0, 4);

    insertIntoTextControl(input, {
      text: "“”",
      wrap: { before: "“", after: "”" },
    });
    expect(input.value).toBe("“deck”");
    expect(input.selectionStart).toBe(5);
  });

  it("does not steal inserts when a contenteditable is focused", () => {
    const el = document.createElement("div");
    el.contentEditable = "true";
    document.body.appendChild(el);
    el.focus();
    expect(tryInsertIntoTextTarget({ text: "—" })).toBe(false);
  });
});
