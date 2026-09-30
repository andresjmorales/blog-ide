import { getSchema } from "@tiptap/core";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { MarkdownManager } from "@tiptap/markdown";
import { createFootnoteExtensions } from "@/lib/editor/footnoteSchema";

/**
 * A footnote body as a ProseMirror doc, parsed with the nested footnote
 * editor's own schema so anchors created inside an open card resolve the
 * same way against a closed note. Cached by content string.
 */

let shared: { schema: Schema; manager: MarkdownManager } | null = null;

function parser() {
  if (!shared) {
    const extensions = createFootnoteExtensions();
    shared = {
      schema: getSchema(extensions),
      manager: new MarkdownManager({ extensions }),
    };
  }
  return shared;
}

const MAX_CACHED = 300;
const cache = new Map<string, PMNode>();

export function footnoteDocFromMarkdown(content: string): PMNode {
  const hit = cache.get(content);
  if (hit) return hit;
  const { schema, manager } = parser();
  let doc: PMNode;
  try {
    doc = schema.nodeFromJSON(manager.parse(content));
  } catch {
    doc = schema.nodeFromJSON({
      type: "doc",
      content: [{ type: "paragraph", content: content ? [{ type: "text", text: content }] : [] }],
    });
  }
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(content, doc);
  return doc;
}
