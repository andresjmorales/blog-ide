import { describe, expect, it } from "vitest";
import {
  addToolbarDivider,
  DEFAULT_TOOLBAR_LAYOUT,
  defaultOverflowItems,
  layoutsEqual,
  moveToolbarEntry,
  normalizeToolbarLayout,
  overflowSlot,
  parseToolbarDropKey,
  preferToolbarDropKey,
  unusedToolbarItems,
} from "@/lib/editor/toolbarLayout";

describe("toolbarLayout", () => {
  it("defaults Aa+ after the link, with inline code inside the overflow", () => {
    const overflow = overflowSlot(DEFAULT_TOOLBAR_LAYOUT);
    const linkIndex = DEFAULT_TOOLBAR_LAYOUT.findIndex(
      (slot) => slot.type === "item" && slot.id === "link"
    );
    const overflowIndex = DEFAULT_TOOLBAR_LAYOUT.findIndex(
      (slot) => slot.type === "overflow"
    );
    expect(overflow?.items).toEqual([
      "code",
      "superscript",
      "subscript",
      "codeBlock",
      "case",
    ]);
    expect(defaultOverflowItems()).toContain("code");
    expect(linkIndex).toBeGreaterThan(-1);
    expect(overflowIndex).toBe(linkIndex + 1);
    expect(unusedToolbarItems(DEFAULT_TOOLBAR_LAYOUT)).toEqual([]);
  });

  it("repairs a missing overflow folder and parks unknown ids", () => {
    const layout = normalizeToolbarLayout([
      { type: "item", id: "bold" },
      { type: "item", id: "link" },
      { type: "item", id: "not-real" },
      { type: "divider" },
    ]);
    const overflow = overflowSlot(layout);
    expect(overflow).toBeTruthy();
    const linkIndex = layout.findIndex(
      (slot) => slot.type === "item" && slot.id === "link"
    );
    expect(layout[linkIndex + 1]?.type).toBe("overflow");
    expect(unusedToolbarItems(layout)).toContain("italic");
    expect(unusedToolbarItems(layout)).not.toContain("bold");
  });

  it("moves inline code from overflow onto the bar", () => {
    const moved = moveToolbarEntry(
      DEFAULT_TOOLBAR_LAYOUT,
      [],
      { zone: "overflow", index: 0 },
      { zone: "bar", index: 0 }
    );
    expect(moved.layout[0]).toEqual({ type: "item", id: "code" });
    expect(overflowSlot(moved.layout)?.items).not.toContain("code");
  });

  it("adds a divider between items", () => {
    const linkIndex = DEFAULT_TOOLBAR_LAYOUT.findIndex(
      (slot) => slot.type === "item" && slot.id === "link"
    );
    const withDivider = addToolbarDivider(DEFAULT_TOOLBAR_LAYOUT, linkIndex);
    expect(withDivider[linkIndex]?.type).toBe("divider");
    expect(layoutsEqual(DEFAULT_TOOLBAR_LAYOUT, DEFAULT_TOOLBAR_LAYOUT)).toBe(
      true
    );
  });
});

describe("parseToolbarDropKey", () => {
  const lengths = { bar: 10, overflow: 5, unused: 2 };

  it("reads a chip index and the end-of-strip fallback", () => {
    expect(parseToolbarDropKey("bar:3", lengths)).toEqual({
      zone: "bar",
      index: 3,
    });
    expect(parseToolbarDropKey("overflow:end", lengths)).toEqual({
      zone: "overflow",
      index: 5,
    });
    expect(parseToolbarDropKey("unused:0", lengths)).toEqual({
      zone: "unused",
      index: 0,
    });
  });

  it("rejects junk", () => {
    expect(parseToolbarDropKey("nope", lengths)).toBeNull();
    expect(parseToolbarDropKey("bar:-1", lengths)).toBeNull();
  });
});

describe("preferToolbarDropKey", () => {
  it("skips the held chip and the strip end when another chip is hit", () => {
    expect(
      preferToolbarDropKey(["bar:7", "bar:11", "bar:end"], "bar:7")
    ).toBe("bar:11");
  });

  it("falls back to the strip when only the source and the gutter remain", () => {
    expect(preferToolbarDropKey(["bar:7", "bar:end"], "bar:7")).toBe("bar:end");
  });
});
