/**
 * Shared footnote-editor chrome helpers. Desktop cards use PinnedSurface so
 * pin / drag / resize do not remount the nested editor or change size.
 */

export const FOOTNOTE_DESKTOP_MIN_WIDTH = 768;

export const FOOTNOTE_CARD_WIDTH = 360;
export const FOOTNOTE_CARD_HEIGHT = 280;
export const FOOTNOTE_CARD_EXPANDED_WIDTH = 448;
export const FOOTNOTE_CARD_EXPANDED_HEIGHT = 320;
export const FOOTNOTE_CARD_MIN_WIDTH = 280;
export const FOOTNOTE_CARD_MIN_HEIGHT = 200;

/** Debounce keystrokes; flush immediately when the nested editor is blurred. */
export const FOOTNOTE_ATTR_SYNC_FOCUSED_MS = 200;

const PLACE_PAD = 12;
const PLACE_GAP = 8;

/** Portals that belong to the open footnote but live outside its DOM subtree. */
export const FOOTNOTE_OUTSIDE_CLICK_IGNORE =
  ".special-chars-panel, .convert-case-menu, .formatting-overflow-menu, .blogide-find-replace, .link-edit-card, .harper-lint-card, .bible-ref-card, .footnote-toolbar-overflow";

export function isDesktopFootnoteSurface(
  viewportWidth: number,
  minWidth: number = FOOTNOTE_DESKTOP_MIN_WIDTH
): boolean {
  return viewportWidth >= minWidth;
}

export function footnoteCardSize(expanded: boolean): {
  width: number;
  height: number;
} {
  return expanded
    ? {
        width: FOOTNOTE_CARD_EXPANDED_WIDTH,
        height: FOOTNOTE_CARD_EXPANDED_HEIGHT,
      }
    : { width: FOOTNOTE_CARD_WIDTH, height: FOOTNOTE_CARD_HEIGHT };
}

/** Grow/shrink with the toolbar only while the user has not resized away. */
export function sizeAfterExpandedToggle(
  expanded: boolean,
  current: { width?: number; height?: number }
): { width: number; height: number } {
  const next = footnoteCardSize(expanded);
  const previous = footnoteCardSize(!expanded);
  const width =
    current.width === previous.width || current.width == null
      ? next.width
      : current.width;
  const height =
    current.height === previous.height || current.height == null
      ? next.height
      : current.height;
  return { width, height };
}

export function normalizeFootnoteMarkdown(value: string): string {
  return value.trim();
}

/** Do not move an already-open (or user-placed) card onto the superscript. */
export function shouldRepositionFootnoteCard(options: {
  alreadyOpen: boolean;
  pinned: boolean;
  userPlaced: boolean;
}): boolean {
  if (options.alreadyOpen) return false;
  if (options.pinned || options.userPlaced) return false;
  return true;
}

/** Follow the superscript only until the user pins, drags, or otherwise places it. */
export function shouldFollowFootnoteRef(options: {
  pinned: boolean;
  userPlaced: boolean;
}): boolean {
  return !options.pinned && !options.userPlaced;
}

export function footnoteAttrSyncDelay(
  isFocused: boolean,
  markdown = ""
): number {
  if (!isFocused) return 0;
  // Link edits often happen while the nested editor is still focused
  // (toolbar mousedown preventDefault). Flush those so the sidenote rail
  // does not lag until a later click.
  if (/\[[^\]]*]\([^)]*\)/.test(markdown)) return 0;
  return FOOTNOTE_ATTR_SYNC_FOCUSED_MS;
}

/**
 * Refuse to blank a non-empty note from an unfocused editor (mount /
 * setContent races). Intentional clears still commit while focused.
 */
export function shouldCommitFootnoteAttrs(options: {
  next: string;
  current: string;
  isFocused: boolean;
}): boolean {
  const next = normalizeFootnoteMarkdown(options.next);
  const current = normalizeFootnoteMarkdown(options.current);
  if (next === current) return false;
  if (!next && current && !options.isFocused) return false;
  return true;
}

/** Do not reset the nested editor from parent attrs while the user is typing. */
export function shouldApplyExternalFootnoteContent(options: {
  incoming: string;
  editorMarkdown: string;
  isFocused: boolean;
}): boolean {
  if (
    normalizeFootnoteMarkdown(options.incoming) ===
    normalizeFootnoteMarkdown(options.editorMarkdown)
  ) {
    return false;
  }
  if (options.isFocused) return false;
  return true;
}

export function isFootnoteOutsidePointerTarget(
  target: EventTarget | null,
  footnoteId: string
): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest(FOOTNOTE_OUTSIDE_CLICK_IGNORE)) return false;
  const owner = target
    .closest("[data-footnote-id]")
    ?.getAttribute("data-footnote-id");
  if (owner === footnoteId) return false;
  return true;
}

export type FootnoteCardRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type PlaceFootnoteCardInput = {
  refRect: FootnoteCardRect;
  sidenoteRect?: FootnoteCardRect | null;
  viewportWidth: number;
  viewportHeight: number;
  editorLeft?: number;
  editorRight?: number;
  cardWidth: number;
  cardHeight: number;
};

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function rectsOverlap(a: FootnoteCardRect, b: FootnoteCardRect): boolean {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

/**
 * Place the floating editor so its titlebar does not cover the superscript.
 * Covering the number made a click look like an immediate drag, and switching
 * chrome mid-gesture also jumped the card size.
 */
export function placeFootnoteCard(input: PlaceFootnoteCardInput): {
  left: number;
  top: number;
} {
  const {
    refRect,
    sidenoteRect,
    viewportWidth,
    viewportHeight,
    cardWidth,
    cardHeight,
  } = input;
  const editorLeft = input.editorLeft ?? 0;
  const editorRight = input.editorRight ?? viewportWidth;
  const minLeft = Math.max(PLACE_PAD, editorLeft + PLACE_PAD);
  const maxLeft = Math.min(
    viewportWidth - cardWidth - PLACE_PAD,
    editorRight - cardWidth - PLACE_PAD
  );
  const minTop = PLACE_PAD;
  const maxTop = Math.max(minTop, viewportHeight - cardHeight - PLACE_PAD);

  const offscreen =
    refRect.bottom < 0 || refRect.top > viewportHeight;
  if (offscreen && sidenoteRect && sidenoteRect.bottom > 0) {
    return {
      left: clamp(sidenoteRect.left - cardWidth - PLACE_GAP, minLeft, maxLeft),
      top: clamp(sidenoteRect.top, minTop, maxTop),
    };
  }

  const belowTop = refRect.bottom + PLACE_GAP;
  const aboveTop = refRect.top - cardHeight - PLACE_GAP;
  const belowFits = belowTop + cardHeight <= viewportHeight - PLACE_PAD;
  const aboveFits = aboveTop >= PLACE_PAD;

  let top: number;
  if (belowFits) top = belowTop;
  else if (aboveFits) top = aboveTop;
  else top = clamp(belowTop, minTop, maxTop);

  let left = clamp(
    refRect.left + refRect.width / 2 - cardWidth / 2,
    minLeft,
    maxLeft
  );

  const cardRect: FootnoteCardRect = {
    left,
    top,
    width: cardWidth,
    height: cardHeight,
    right: left + cardWidth,
    bottom: top + cardHeight,
  };

  if (rectsOverlap(cardRect, refRect)) {
    const leftSide = refRect.left - cardWidth - PLACE_GAP;
    const rightSide = refRect.right + PLACE_GAP;
    if (leftSide >= minLeft) left = leftSide;
    else if (rightSide + cardWidth <= viewportWidth - PLACE_PAD) {
      left = clamp(rightSide, minLeft, maxLeft);
    }
    top = clamp(top, minTop, maxTop);
  }

  return {
    left: clamp(left, minLeft, maxLeft),
    top: clamp(top, minTop, maxTop),
  };
}
