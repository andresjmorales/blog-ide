import { describe, expect, it } from "vitest";
import {
  FOOTNOTE_ATTR_SYNC_FOCUSED_MS,
  FOOTNOTE_CARD_EXPANDED_HEIGHT,
  FOOTNOTE_CARD_EXPANDED_WIDTH,
  FOOTNOTE_CARD_HEIGHT,
  FOOTNOTE_CARD_WIDTH,
  footnoteAttrSyncDelay,
  isDesktopFootnoteSurface,
  isFootnoteOutsidePointerTarget,
  placeFootnoteCard,
  shouldApplyExternalFootnoteContent,
  shouldCommitFootnoteAttrs,
  shouldFollowFootnoteRef,
  shouldRepositionFootnoteCard,
  sizeAfterExpandedToggle,
} from "@/lib/editor/footnoteCard";

function rect(
  left: number,
  top: number,
  width: number,
  height: number
) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

describe("footnote desktop chrome", () => {
  it("uses PinnedSurface from the 768px breakpoint", () => {
    expect(isDesktopFootnoteSurface(767)).toBe(false);
    expect(isDesktopFootnoteSurface(768)).toBe(true);
  });

  it("does not reposition an already open or user-placed card", () => {
    expect(
      shouldRepositionFootnoteCard({
        alreadyOpen: true,
        pinned: false,
        userPlaced: false,
      })
    ).toBe(false);
    expect(
      shouldRepositionFootnoteCard({
        alreadyOpen: false,
        pinned: true,
        userPlaced: false,
      })
    ).toBe(false);
    expect(
      shouldRepositionFootnoteCard({
        alreadyOpen: false,
        pinned: false,
        userPlaced: true,
      })
    ).toBe(false);
    expect(
      shouldRepositionFootnoteCard({
        alreadyOpen: false,
        pinned: false,
        userPlaced: false,
      })
    ).toBe(true);
  });

  it("does not follow the superscript after pin, drag, or unpin-in-place", () => {
    expect(
      shouldFollowFootnoteRef({ pinned: true, userPlaced: false })
    ).toBe(false);
    expect(
      shouldFollowFootnoteRef({ pinned: false, userPlaced: true })
    ).toBe(false);
    expect(
      shouldFollowFootnoteRef({ pinned: false, userPlaced: false })
    ).toBe(true);
  });
});

describe("footnote attr sync", () => {
  it("debounces while focused and flushes immediately when blurred", () => {
    expect(footnoteAttrSyncDelay(true)).toBe(FOOTNOTE_ATTR_SYNC_FOCUSED_MS);
    expect(footnoteAttrSyncDelay(false)).toBe(0);
  });

  it("flushes immediately when the nested editor contains a hyperlink", () => {
    expect(
      footnoteAttrSyncDelay(true, "See [source](https://example.com).")
    ).toBe(0);
  });

  it("refuses to blank a populated note from an unfocused editor", () => {
    expect(
      shouldCommitFootnoteAttrs({
        next: "",
        current: "See [link](https://example.com).",
        isFocused: false,
      })
    ).toBe(false);
    expect(
      shouldCommitFootnoteAttrs({
        next: "",
        current: "Keep me",
        isFocused: true,
      })
    ).toBe(true);
  });

  it("commits a hyperlink while the nested editor is blurred", () => {
    expect(
      shouldCommitFootnoteAttrs({
        next: "See [source](https://example.com).",
        current: "See source.",
        isFocused: false,
      })
    ).toBe(true);
  });

  it("does not overwrite a focused nested editor from parent attrs", () => {
    expect(
      shouldApplyExternalFootnoteContent({
        incoming: "old",
        editorMarkdown: "typ",
        isFocused: true,
      })
    ).toBe(false);
    expect(
      shouldApplyExternalFootnoteContent({
        incoming: "from undo",
        editorMarkdown: "typ",
        isFocused: false,
      })
    ).toBe(true);
    expect(
      shouldApplyExternalFootnoteContent({
        incoming: "same\n",
        editorMarkdown: "same",
        isFocused: false,
      })
    ).toBe(false);
  });
});

describe("footnote outside pointer", () => {
  it("keeps the editor open for the link bubble and other footnote portals", () => {
    const link = document.createElement("div");
    link.className = "link-edit-card";
    document.body.append(link);
    expect(isFootnoteOutsidePointerTarget(link, "fn-1")).toBe(false);

    const chars = document.createElement("div");
    chars.className = "special-chars-panel";
    document.body.append(chars);
    expect(isFootnoteOutsidePointerTarget(chars, "fn-1")).toBe(false);

    const convert = document.createElement("div");
    convert.className = "convert-case-menu";
    document.body.append(convert);
    expect(isFootnoteOutsidePointerTarget(convert, "fn-1")).toBe(false);

    const overflow = document.createElement("div");
    overflow.className = "footnote-toolbar-overflow";
    document.body.append(overflow);
    expect(isFootnoteOutsidePointerTarget(overflow, "fn-1")).toBe(false);

    const surface = document.createElement("div");
    surface.setAttribute("data-footnote-id", "fn-1");
    surface.className = "pinned-surface footnote-pin";
    document.body.append(surface);
    expect(isFootnoteOutsidePointerTarget(surface, "fn-1")).toBe(false);

    const rail = document.createElement("div");
    rail.setAttribute("data-footnote-id", "fn-1");
    rail.className = "sidenote-rail-item";
    document.body.append(rail);
    expect(isFootnoteOutsidePointerTarget(rail, "fn-1")).toBe(false);

    const other = document.createElement("div");
    other.className = "editor-prose";
    document.body.append(other);
    expect(isFootnoteOutsidePointerTarget(other, "fn-1")).toBe(true);

    link.remove();
    chars.remove();
    convert.remove();
    surface.remove();
    rail.remove();
    other.remove();
  });
});

describe("placeFootnoteCard", () => {
  it("places the card below the superscript when there is room", () => {
    const placed = placeFootnoteCard({
      refRect: rect(400, 80, 12, 14),
      viewportWidth: 1200,
      viewportHeight: 800,
      cardWidth: FOOTNOTE_CARD_WIDTH,
      cardHeight: FOOTNOTE_CARD_HEIGHT,
    });
    expect(placed.top).toBe(80 + 14 + 8);
    expect(placed.left).toBeGreaterThan(12);
  });

  it("flips above the superscript near the bottom of the viewport", () => {
    const ref = rect(400, 700, 12, 14);
    const placed = placeFootnoteCard({
      refRect: ref,
      viewportWidth: 1200,
      viewportHeight: 800,
      cardWidth: FOOTNOTE_CARD_WIDTH,
      cardHeight: FOOTNOTE_CARD_HEIGHT,
    });
    expect(placed.top + FOOTNOTE_CARD_HEIGHT).toBeLessThanOrEqual(ref.top);
    expect(placed.top).toBeLessThan(ref.top);
  });

  it("shifts sideways rather than covering the number when vertical space is tight", () => {
    const ref = rect(400, 200, 12, 14);
    const placed = placeFootnoteCard({
      refRect: ref,
      viewportWidth: 900,
      viewportHeight: 360,
      cardWidth: FOOTNOTE_CARD_WIDTH,
      cardHeight: FOOTNOTE_CARD_HEIGHT,
    });
    const overlaps =
      placed.left < ref.right &&
      placed.left + FOOTNOTE_CARD_WIDTH > ref.left &&
      placed.top < ref.bottom &&
      placed.top + FOOTNOTE_CARD_HEIGHT > ref.top;
    expect(overlaps).toBe(false);
  });

  it("anchors beside a visible sidenote when the superscript is off-screen", () => {
    const placed = placeFootnoteCard({
      refRect: rect(400, -80, 12, 14),
      sidenoteRect: rect(900, 120, 220, 80),
      viewportWidth: 1200,
      viewportHeight: 800,
      cardWidth: FOOTNOTE_CARD_WIDTH,
      cardHeight: FOOTNOTE_CARD_HEIGHT,
    });
    expect(placed.left + FOOTNOTE_CARD_WIDTH).toBeLessThanOrEqual(900);
    expect(placed.top).toBe(120);
  });
});

describe("sizeAfterExpandedToggle", () => {
  it("grows the default compact card when expanding the toolbar", () => {
    expect(
      sizeAfterExpandedToggle(true, {
        width: FOOTNOTE_CARD_WIDTH,
        height: FOOTNOTE_CARD_HEIGHT,
      })
    ).toEqual({
      width: FOOTNOTE_CARD_EXPANDED_WIDTH,
      height: FOOTNOTE_CARD_EXPANDED_HEIGHT,
    });
  });

  it("keeps a user-resized size", () => {
    expect(
      sizeAfterExpandedToggle(true, { width: 500, height: 400 })
    ).toEqual({ width: 500, height: 400 });
  });
});
