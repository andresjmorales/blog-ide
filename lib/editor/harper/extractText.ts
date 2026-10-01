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
  /** True when `[start, end)` touches a stand-in for an atom (inline math). */
  touchesStandIn?: (start: number, end: number) => boolean;
};

export type LintBlock = LintTextMap & {
  /** First mapped ProseMirror position in this block. */
  from: number;
  /** Exclusive end of the last mapped character. */
  to: number;
};

/**
 * Inline math has no text, so dropping it leaves "the  value" (double space)
 * or "'s" after nothing. Harper reads a variable-like word in its place; the
 * stand-in maps to no position and lints touching it are dropped.
 */
export const INLINE_MATH_STAND_IN = "x";

type StandIn = { start: number; end: number };

function touchesAny(standIns: StandIn[], start: number, end: number): boolean {
  return standIns.some((s) => start < s.end && end > s.start);
}

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

function makeMappers(ranges: MappedRange[]): Pick<LintTextMap, "posAt" | "endPosAt"> {
  function posAt(offset: number): number | null {
    if (offset < 0) return null;
    for (const range of ranges) {
      if (offset < range.textStart) return null;
      if (offset < range.textEnd) {
        return range.pmPos + (offset - range.textStart);
      }
      if (offset === range.textEnd) {
        return range.pmPos + (range.textEnd - range.textStart);
      }
    }
    return null;
  }

  function endPosAt(offset: number): number | null {
    if (offset <= 0) return posAt(0);
    const direct = posAt(offset);
    if (direct != null) return direct;
    for (let i = offset - 1; i >= 0; i--) {
      const mapped = posAt(i);
      if (mapped != null) return mapped + 1;
    }
    return null;
  }

  return { posAt, endPosAt };
}

function finishBlock(
  text: string,
  ranges: MappedRange[],
  standIns: StandIn[]
): LintBlock | null {
  if (!text || ranges.length === 0) return null;
  const last = ranges[ranges.length - 1];
  const { posAt, endPosAt } = makeMappers(ranges);
  return {
    text,
    from: ranges[0].pmPos,
    to: last.pmPos + (last.textEnd - last.textStart),
    posAt,
    endPosAt,
    touchesStandIn: (start, end) => touchesAny(standIns, start, end),
  };
}

/** One plaintext block per essay textblock (paragraph, heading, …). */
export function extractLintBlocks(doc: WalkNode): LintBlock[] {
  const blocks: LintBlock[] = [];
  let text = "";
  let ranges: MappedRange[] = [];
  let standIns: StandIn[] = [];

  function flush() {
    const block = finishBlock(text, ranges, standIns);
    if (block) blocks.push(block);
    text = "";
    ranges = [];
    standIns = [];
  }

  doc.descendants((node, pos) => {
    if (node.type.name === "codeBlock") return false;
    if (node.type.name === "footnoteRef") return false;
    if (node.type.name === "inlineMath") {
      const start = text.length;
      text += INLINE_MATH_STAND_IN;
      standIns.push({ start, end: text.length });
      return false;
    }
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
      flush();
    }
    return;
  });
  flush();
  return blocks;
}

export function joinLintBlocks(blocks: LintBlock[]): LintTextMap {
  const blockStarts: number[] = [];
  let text = "";
  for (let i = 0; i < blocks.length; i++) {
    if (i > 0) text += "\n\n";
    blockStarts.push(text.length);
    text += blocks[i].text;
  }

  function posAt(offset: number): number | null {
    for (let i = 0; i < blocks.length; i++) {
      const start = blockStarts[i];
      const end = start + blocks[i].text.length;
      if (offset < start) return null;
      if (offset <= end) return blocks[i].posAt(offset - start);
    }
    return null;
  }

  function endPosAt(offset: number): number | null {
    if (offset <= 0) return posAt(0);
    const direct = posAt(offset);
    if (direct != null) return direct;
    for (let i = offset - 1; i >= 0; i--) {
      const mapped = posAt(i);
      if (mapped != null) return mapped + 1;
    }
    return null;
  }

  function touchesStandIn(start: number, end: number): boolean {
    for (let i = 0; i < blocks.length; i++) {
      const blockStart = blockStarts[i];
      const blockEnd = blockStart + blocks[i].text.length;
      if (end <= blockStart || start >= blockEnd) continue;
      if (blocks[i].touchesStandIn?.(start - blockStart, end - blockStart)) {
        return true;
      }
    }
    return false;
  }

  return { text, posAt, endPosAt, touchesStandIn };
}

export function extractLintText(doc: WalkNode): LintTextMap {
  return joinLintBlocks(extractLintBlocks(doc));
}

export function mapSpanToRange(
  map: LintTextMap,
  start: number,
  end: number
): { from: number; to: number } | null {
  if (end <= start) return null;
  if (map.touchesStandIn?.(start, end)) return null;
  const from = map.posAt(start);
  const to = map.endPosAt(end);
  if (from == null || to == null || to <= from) return null;
  return { from, to };
}

export function lintDocumentKey(blocks: LintBlock[]): string {
  return blocks.map((block) => block.text).join("\n\n");
}
