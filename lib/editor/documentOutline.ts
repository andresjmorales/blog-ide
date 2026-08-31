import {
  collectDocumentStats,
  type DocumentStats,
} from "@/lib/editor/documentStats";

export type OutlineHeading = {
  level: number;
  text: string;
  pos: number;
};

export type OutlineSnapshot = {
  headings: OutlineHeading[];
  stats: DocumentStats;
};

type OutlineNode = {
  type: { name: string };
  attrs?: Record<string, unknown>;
  textContent?: string;
  descendants: (
    f: (node: OutlineNode, pos: number) => boolean | void
  ) => void;
};

export function collectOutlineHeadings(doc: OutlineNode): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const level = Number(node.attrs?.level ?? 1);
    const text = String(node.textContent ?? "").trim();
    if (!text) return;
    headings.push({ level, text, pos });
  });
  return headings;
}

export function takeOutlineSnapshot(doc: OutlineNode): OutlineSnapshot {
  return {
    headings: collectOutlineHeadings(doc),
    stats: collectDocumentStats(doc),
  };
}

export function outlineSnapshotsEqual(
  a: OutlineSnapshot,
  b: OutlineSnapshot
): boolean {
  if (a === b) return true;
  if (a.headings.length !== b.headings.length) return false;
  for (let i = 0; i < a.headings.length; i++) {
    const left = a.headings[i];
    const right = b.headings[i];
    if (
      left.level !== right.level ||
      left.text !== right.text ||
      left.pos !== right.pos
    ) {
      return false;
    }
  }
  const left = a.stats;
  const right = b.stats;
  return (
    left.words === right.words &&
    left.characters === right.characters &&
    left.charactersNoSpaces === right.charactersNoSpaces &&
    left.paragraphs === right.paragraphs &&
    left.headings === right.headings
  );
}

/** Pause after the last keystroke before walking the essay for outline/stats. */
export const OUTLINE_REFRESH_MS = 180;
