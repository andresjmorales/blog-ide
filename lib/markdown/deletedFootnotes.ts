/**
 * BlogIDE-only soft-delete history for footnotes. Stored as an HTML comment
 * trailer on the markdown body so plain exports stay readable and frontmatter
 * remains untouched.
 */

import { stripBlogideTrailers } from "@/lib/markdown/essayCitations";

export type DeletedFootnote = {
  id: string;
  content: string;
  deletedAt: string;
};

export const MAX_DELETED_FOOTNOTES = 50;

export function parseDeletedFootnotesPayload(
  payload: string | null
): DeletedFootnote[] {
  if (!payload) return [];
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is DeletedFootnote =>
          !!entry &&
          typeof entry === "object" &&
          typeof (entry as DeletedFootnote).id === "string" &&
          typeof (entry as DeletedFootnote).content === "string"
      )
      .map((entry) => ({
        id: entry.id,
        content: entry.content,
        deletedAt:
          typeof entry.deletedAt === "string"
            ? entry.deletedAt
            : new Date(0).toISOString(),
      }))
      .slice(0, MAX_DELETED_FOOTNOTES);
  } catch {
    return [];
  }
}

export function stripDeletedFootnotesTrailer(body: string): {
  body: string;
  deleted: DeletedFootnote[];
} {
  const stripped = stripBlogideTrailers(body);
  return {
    body: stripped.body,
    deleted: parseDeletedFootnotesPayload(stripped.deletedPayload),
  };
}

export function appendDeletedFootnotesTrailer(
  body: string,
  deleted: DeletedFootnote[]
): string {
  if (deleted.length === 0) return body;
  const trimmed = body.replace(/\s+$/, "");
  const payload = JSON.stringify(deleted.slice(0, MAX_DELETED_FOOTNOTES));
  return `${trimmed}\n\n<!--blogide-deleted-footnotes:${payload}-->\n`;
}

export function mergeDeletedFootnotes(
  existing: DeletedFootnote[],
  incoming: DeletedFootnote[]
): DeletedFootnote[] {
  const byId = new Map<string, DeletedFootnote>();
  for (const entry of existing) byId.set(entry.id, entry);
  for (const entry of incoming) byId.set(entry.id, entry);
  return [...byId.values()]
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
    .slice(0, MAX_DELETED_FOOTNOTES);
}
