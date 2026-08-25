import { describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import {
  EDITOR_SCROLL_SELECTOR,
  OUTLINE_HEADING_ALIGN,
  clampScrollTop,
  findEditorScroller,
  scrollHeadingIntoView,
  scrollTopForAlignedTarget,
} from "@/lib/editor/editorScroll";

const PANE = {
  scrollerClientHeight: 800,
  scrollerScrollHeight: 4000,
  scrollerViewportTop: 100,
};

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

describe("clampScrollTop", () => {
  it("clamps to the start of a short document", () => {
    expect(clampScrollTop(-40, 500, 800)).toBe(0);
    expect(clampScrollTop(20, 500, 800)).toBe(0);
  });

  it("clamps to the last pixel that still fits the pane", () => {
    expect(clampScrollTop(9999, 2000, 800)).toBe(1200);
    expect(clampScrollTop(1200, 2000, 800)).toBe(1200);
  });
});

describe("scrollTopForAlignedTarget", () => {
  it("places a mid-document heading near center-top", () => {
    const next = scrollTopForAlignedTarget({
      ...PANE,
      scrollerScrollTop: 0,
      targetViewportTop: 2100,
      targetHeight: 40,
    });
    const targetOffset = 2100 - 100 + 0;
    expect(next).toBe(
      targetOffset - PANE.scrollerClientHeight * OUTLINE_HEADING_ALIGN
    );
  });

  it("scrolls up when the heading is above the current view", () => {
    const next = scrollTopForAlignedTarget({
      ...PANE,
      scrollerScrollTop: 2800,
      targetViewportTop: 150,
      targetHeight: 32,
    });
    const targetOffset = 150 - 100 + 2800;
    expect(next).toBe(
      targetOffset - PANE.scrollerClientHeight * OUTLINE_HEADING_ALIGN
    );
    expect(next).toBeLessThan(2800);
  });

  it("stops at 0 when there is not enough content above the heading", () => {
    expect(
      scrollTopForAlignedTarget({
        ...PANE,
        scrollerScrollTop: 400,
        targetViewportTop: 140,
        targetHeight: 36,
      })
    ).toBe(0);
  });

  it("stops at max scroll when the heading is near the end of the document", () => {
    const max = PANE.scrollerScrollHeight - PANE.scrollerClientHeight;
    const next = scrollTopForAlignedTarget({
      ...PANE,
      scrollerScrollTop: 0,
      targetViewportTop: 3900,
      targetHeight: 40,
    });
    expect(next).toBe(max);
  });

  it("pins a heading taller than the pane to the top instead of clipping it", () => {
    const next = scrollTopForAlignedTarget({
      ...PANE,
      scrollerScrollTop: 0,
      targetViewportTop: 2100,
      targetHeight: 900,
    });
    const targetOffset = 2100 - 100 + 0;
    expect(next).toBe(targetOffset);
  });
});

describe("findEditorScroller", () => {
  it("prefers the essay pane marked with data-blogide-editor-scroll", () => {
    const pane = document.createElement("div");
    pane.setAttribute("data-blogide-editor-scroll", "");
    const prose = document.createElement("div");
    pane.appendChild(prose);
    document.body.appendChild(pane);
    try {
      const editor = { view: { dom: prose } } as unknown as Editor;
      expect(findEditorScroller(editor)).toBe(pane);
      expect(pane.matches(EDITOR_SCROLL_SELECTOR)).toBe(true);
    } finally {
      pane.remove();
    }
  });
});

describe("scrollHeadingIntoView", () => {
  it("scrolls the essay pane so the heading lands at the aligned offset", async () => {
    const pane = document.createElement("div");
    pane.setAttribute("data-blogide-editor-scroll", "");
    Object.defineProperty(pane, "clientHeight", { value: 800 });
    Object.defineProperty(pane, "scrollHeight", { value: 4000 });
    pane.scrollTop = 0;
    pane.getBoundingClientRect = () =>
      ({
        top: 100,
        bottom: 900,
        left: 0,
        right: 600,
        width: 600,
        height: 800,
        x: 0,
        y: 100,
        toJSON() {
          return {};
        },
      }) as DOMRect;

    const heading = document.createElement("h2");
    heading.getBoundingClientRect = () =>
      ({
        top: 2100,
        bottom: 2140,
        left: 0,
        right: 600,
        width: 600,
        height: 40,
        x: 0,
        y: 2100,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    pane.scrollTo = ((options?: ScrollToOptions | number) => {
      if (typeof options === "object" && options?.top != null) {
        pane.scrollTop = options.top;
      }
    }) as typeof pane.scrollTo;
    pane.appendChild(heading);
    document.body.appendChild(pane);

    const editor = {
      isDestroyed: false,
      view: {
        dom: heading,
        nodeDOM: () => heading,
      },
      state: { doc: { content: { size: 40 } } },
    } as unknown as Editor;

    try {
      scrollHeadingIntoView(editor, 1);
      await nextFrame();
      const expected = 2100 - 100 - 800 * OUTLINE_HEADING_ALIGN;
      expect(pane.scrollTop).toBeCloseTo(expected, 0);
    } finally {
      pane.remove();
    }
  });
});
