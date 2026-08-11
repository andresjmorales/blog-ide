/**
 * Flatten a ProseMirror doc to plaintext for Harper, with offset → position map.
 * Block boundaries become `\n\n` (unmapped) so sentences don't run together.
 */

export type LintTextMap = {
  text: string;
  /** Map a UTF-16 offset in `text` to a ProseMirror position, or null. */
  posAt: (offset: number) => number | null;
  /** Map an exclusive end offset; clamps into the last mapped character. */
  endPosAt: (offset: number) => number | null;
};

type MappedRange = {
  textStart: number;
  textEnd: number;
  pmPos: number;
};

type WalkNode = {
  isText: boolean;
  isBlock: boolean;
  text?: string;
  nodeSize: number;
  type: { name: string };
  descendants: (
    f: (node: WalkNode, pos: number, parent: WalkNode | null) => boolean | void
  ) => void;
};

export function extractLintText(doc: WalkNode): LintTextMap {
  let text = "";
  const ranges: MappedRange[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") return false;
    if (node.type.name === "footnoteRef") return false;
    if (node.isText && node.text) {
      const textStart = text.length;
      text += node.text;
      ranges.push({
        textStart,
        textEnd: text.length,
        pmPos: pos,
      });
      return;
    }
    if (node.isBlock && text.length > 0 && !text.endsWith("\n")) {
      text += "\n\n";
    }
    return;
  });

  function posAt(offset: number): number | null {
    if (offset < 0) return null;
    for (const range of ranges) {
      if (offset < range.textStart) return null;
      if (offset < range.textEnd) {
        return range.pmPos + (offset - range.textStart);
      }
      // Exact end of this text node.
      if (offset === range.textEnd) {
        return range.pmPos + (range.textEnd - range.textStart);
      }
    }
    return null;
  }

  function endPosAt(offset: number): number | null {
    if (offset <= 0) return posAt(0);
    // Prefer the mapped position at offset; if it landed on a separator hole,
    // step back to the previous character.
    const direct = posAt(offset);
    if (direct != null) return direct;
    for (let i = offset - 1; i >= 0; i--) {
      const mapped = posAt(i);
      if (mapped != null) return mapped + 1;
    }
    return null;
  }

  return { text, posAt, endPosAt };
}

export function mapSpanToRange(
  map: LintTextMap,
  start: number,
  end: number
): { from: number; to: number } | null {
  if (end <= start) return null;
  const from = map.posAt(start);
  const to = map.endPosAt(end);
  if (from == null || to == null || to <= from) return null;
  return { from, to };
}
