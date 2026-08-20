import type { Node as PMNode } from "@tiptap/pm/model";
import {
  bibleSearchQuery,
  detectEnglishBibleRefs,
} from "@/lib/bible/detect";

const SKIP_BLOCKS = new Set(["codeBlock", "footnoteRef"]);

export type BibleRefHit = {
  id: string;
  from: number;
  to: number;
  text: string;
  label: string;
  search: string;
  serialized: string;
};

function skipTextNode(node: PMNode): boolean {
  return node.marks.some((mark) => mark.type.name === "code");
}

/** Find Bible references in a ProseMirror doc without mutating it. */
export function collectBibleRefHits(doc: PMNode): BibleRefHit[] {
  const hits: BibleRefHit[] = [];
  doc.descendants((node, pos) => {
    if (SKIP_BLOCKS.has(node.type.name)) return false;
    if (!node.isText || !node.text || skipTextNode(node)) return;
    for (const match of detectEnglishBibleRefs(node.text)) {
      const from = pos + match.index;
      const to = from + match.text.length;
      if (to <= from) continue;
      const serialized = match.ref.to_serialized();
      hits.push({
        id: `${from}-${to}-${serialized}`,
        from,
        to,
        text: match.text,
        label: match.ref.toString(),
        search: bibleSearchQuery(match),
        serialized,
      });
    }
  });
  return hits;
}
