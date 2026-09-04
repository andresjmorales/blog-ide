import type { Editor } from "@tiptap/core";

export const EDITOR_SCROLL_SELECTOR = "[data-blogide-editor-scroll]";

/**
 * Place the heading about a third of the way down the essay pane — above
 * true center, below a flush-top snap.
 */
export const OUTLINE_HEADING_ALIGN = 0.32;

export type ScrollTargetLayout = {
  scrollerScrollTop: number;
  scrollerClientHeight: number;
  scrollerScrollHeight: number;
  scrollerViewportTop: number;
  targetViewportTop: number;
  targetHeight?: number;
  /** 0 = flush with the pane top, 0.5 = vertical center. */
  align?: number;
};

export function findEditorScroller(editor: Editor): HTMLElement | null {
  const rooted = editor.view.dom.closest(EDITOR_SCROLL_SELECTOR);
  if (rooted instanceof HTMLElement) {
    return rooted;
  }
  let root: Element | null = editor.view.dom.parentElement;
  let fallback: HTMLElement | null = null;
  while (root) {
    if (root instanceof HTMLElement) {
      const style = getComputedStyle(root);
      if (
        /(auto|scroll|overlay)/.test(
          `${style.overflow}${style.overflowY}${style.overflowX}`
        )
      ) {
        fallback = root;
        if (root.scrollHeight > root.clientHeight + 1) {
          return root;
        }
      }
    }
    root = root.parentElement;
  }
  return fallback;
}

export function clampScrollTop(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number
): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  if (!Number.isFinite(scrollTop)) return 0;
  return Math.min(max, Math.max(0, scrollTop));
}

/**
 * ScrollTop that puts `target` at `align` of the scroller, clamped so we
 * never ask the pane to scroll past the start or end of the document.
 */
export function scrollTopForAlignedTarget(layout: ScrollTargetLayout): number {
  const {
    scrollerScrollTop,
    scrollerClientHeight,
    scrollerScrollHeight,
    scrollerViewportTop,
    targetViewportTop,
    targetHeight = 0,
    align = OUTLINE_HEADING_ALIGN,
  } = layout;

  const targetOffset =
    targetViewportTop - scrollerViewportTop + scrollerScrollTop;

  let usedAlign = align;
  if (scrollerClientHeight <= 0) {
    usedAlign = 0;
  } else if (targetHeight >= scrollerClientHeight) {
    usedAlign = 0;
  } else {
    const maxAlign = 1 - targetHeight / scrollerClientHeight;
    usedAlign = Math.min(align, Math.max(0, maxAlign));
  }

  const desired = targetOffset - scrollerClientHeight * usedAlign;
  return clampScrollTop(desired, scrollerScrollHeight, scrollerClientHeight);
}

function headingBox(
  editor: Editor,
  pos: number
): { top: number; height: number } | null {
  const dom = editor.view.nodeDOM(pos);
  if (dom instanceof HTMLElement) {
    const rect = dom.getBoundingClientRect();
    return { top: rect.top, height: rect.height };
  }
  if (dom instanceof Node && dom.parentElement) {
    const rect = dom.parentElement.getBoundingClientRect();
    return { top: rect.top, height: rect.height };
  }
  try {
    const inner = Math.min(pos + 1, editor.state.doc.content.size);
    const coords = editor.view.coordsAtPos(inner);
    return { top: coords.top, height: Math.max(0, coords.bottom - coords.top) };
  } catch {
    return null;
  }
}

function applyScrollTop(
  scroller: HTMLElement,
  top: number,
  behavior: ScrollBehavior
): void {
  if (Math.abs(top - scroller.scrollTop) < 1) return;
  if (typeof scroller.scrollTo === "function") {
    scroller.scrollTo({ top, behavior });
    return;
  }
  scroller.scrollTop = top;
}

export function scrollScrollerToTarget(
  scroller: HTMLElement,
  target: { viewportTop: number; height?: number },
  options?: { align?: number; behavior?: ScrollBehavior }
): void {
  const rect = scroller.getBoundingClientRect();
  const nextTop = scrollTopForAlignedTarget({
    scrollerScrollTop: scroller.scrollTop,
    scrollerClientHeight: scroller.clientHeight,
    scrollerScrollHeight: scroller.scrollHeight,
    scrollerViewportTop: rect.top,
    targetViewportTop: target.viewportTop,
    targetHeight: target.height ?? 0,
    align: options?.align,
  });
  applyScrollTop(scroller, nextTop, options?.behavior ?? "auto");
}

export function boxAtEditorPos(
  editor: Editor,
  pos: number
): { top: number; height: number } | null {
  return headingBox(editor, pos);
}

export function coordsBox(
  editor: Editor,
  from: number,
  to?: number
): { top: number; height: number } | null {
  try {
    const start = editor.view.coordsAtPos(from);
    let end = start;
    if (to != null && to !== from) {
      try {
        end = editor.view.coordsAtPos(to);
      } catch {
        // End-of-block positions often throw; the start box is enough to scroll.
      }
    }
    const top = Math.min(start.top, end.top);
    const bottom = Math.max(start.bottom, end.bottom);
    return { top, height: Math.max(1, bottom - top) };
  } catch {
    return null;
  }
}

/**
 * Scroll the essay pane so the heading at `pos` sits near center-top.
 * Does not use `Element.scrollIntoView`, which also yanks outer panels and
 * often stops once the heading is merely peeking into view.
 */
export function scrollHeadingIntoView(editor: Editor, pos: number): void {
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return;
    const scroller = findEditorScroller(editor);
    if (!scroller) return;
    const box = headingBox(editor, pos);
    if (!box) return;
    scrollScrollerToTarget(scroller, { viewportTop: box.top, height: box.height }, {
      behavior: "smooth",
    });
  });
}
