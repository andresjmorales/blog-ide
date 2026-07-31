/**
 * When a non-editor field (find/replace) is focused, special-character
 * inserts should go there instead of the ProseMirror doc.
 */

export type TextInsertPayload = {
  text: string;
  wrap?: { before: string; after: string };
};

type InsertHandler = (payload: TextInsertPayload) => boolean;

let activeTarget: InsertHandler | null = null;

export function setTextInsertTarget(handler: InsertHandler | null): void {
  activeTarget = handler;
}

/** Returns true if a registered target consumed the insert. */
export function tryInsertIntoTextTarget(payload: TextInsertPayload): boolean {
  if (!activeTarget) return false;
  return activeTarget(payload);
}
