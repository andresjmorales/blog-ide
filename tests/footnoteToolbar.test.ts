import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fitToolbarItems, type ToolbarFitItem } from "@/lib/editor/footnoteToolbar";
import { DEFAULT_TOOLBAR_LAYOUT } from "@/lib/editor/toolbarLayout";

const btn = (width = 32): ToolbarFitItem => ({ kind: "item", width });
const sep: ToolbarFitItem = { kind: "sep", width: 4 };

describe("fitToolbarItems", () => {
  it("shows every item when they all fit without an overflow button", () => {
    const items = [btn(), btn(), sep, btn()];
    expect(fitToolbarItems(200, items, 32, 4)).toBe(items.length);
  });

  it("reserves the overflow button and packs from the left", () => {
    const items = [btn(), btn(), btn(), btn(), btn()];
    // 5*32 + 4*4 = 176 without overflow; with overflow 176+32+4=212.
    expect(fitToolbarItems(160, items, 32, 4)).toBeLessThan(items.length);
    expect(fitToolbarItems(160, items, 32, 4)).toBeGreaterThan(0);
  });

  it("drops a trailing separator instead of leaving it next to overflow", () => {
    const items = [btn(40), sep, btn(40), sep];
    const count = fitToolbarItems(90, items, 32, 4);
    expect(count).toBeGreaterThan(0);
    expect(items[count - 1]?.kind).not.toBe("sep");
  });

  it("follows the main toolbar order and does not add main-only tools", () => {
    const source = readFileSync(
      join(__dirname, "../components/FootnoteToolbar.tsx"),
      "utf8"
    );
    const start = source.indexOf("const tools: ToolDef[]");
    const end = source.indexOf("useLayoutEffect(", start);
    const ids = [...source.slice(start, end).matchAll(/id: "([^"]+)"/g)].map(
      (match) => match[1]
    );
    expect(ids).toEqual([
      "undo",
      "redo",
      "sep-lists",
      "bullet",
      "ordered",
      "sep-marks",
      "bold",
      "italic",
      "strike",
      "quote",
      "link",
      "format",
      "sep-extra",
      "chars",
    ]);

    const main: string[] = [];
    for (const slot of DEFAULT_TOOLBAR_LAYOUT) {
      if (slot.type === "item") main.push(slot.id);
      if (slot.type === "overflow") main.push(...slot.items);
    }
    const footnote = [
      "undo",
      "redo",
      "bullet",
      "ordered",
      "bold",
      "italic",
      "strike",
      "blockquote",
      "link",
      "code",
      "superscript",
      "subscript",
      "codeBlock",
      "case",
      "chars",
      "cleanup",
    ];
    let index = 0;
    for (const id of main) {
      if (footnote[index] === id) index += 1;
    }
    expect(index).toBe(footnote.length);
  });

  it("returns 0 for an empty row", () => {
    expect(fitToolbarItems(200, [], 32, 4)).toBe(0);
    expect(fitToolbarItems(0, [btn()], 32, 4)).toBe(0);
  });
});
