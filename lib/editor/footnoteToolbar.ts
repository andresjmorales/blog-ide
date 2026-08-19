export type ToolbarFitItem = {
  /** Separators never go in the overflow menu. */
  kind: "item" | "sep";
  width: number;
};

/**
 * How many leading items fit in `availableWidth`. When they do not all fit,
 * reserve `overflowWidth` for a ⋯ button and pack from the left.
 */
export function fitToolbarItems(
  availableWidth: number,
  items: ToolbarFitItem[],
  overflowWidth: number,
  gap: number
): number {
  if (items.length === 0 || availableWidth <= 0) return 0;

  function rowWidth(count: number, withOverflow: boolean): number {
    let width = withOverflow ? overflowWidth : 0;
    let shown = 0;
    for (let i = 0; i < count; i++) {
      const item = items[i];
      if (!item) break;
      if (shown > 0 || withOverflow) width += gap;
      width += item.width;
      shown += 1;
    }
    return width;
  }

  if (rowWidth(items.length, false) <= availableWidth) {
    return items.length;
  }

  let count = items.length;
  while (count > 0 && rowWidth(count, true) > availableWidth) {
    count -= 1;
  }
  while (count > 0 && items[count - 1]?.kind === "sep") {
    count -= 1;
  }
  return count;
}
