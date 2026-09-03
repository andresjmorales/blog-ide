/**
 * Live TipTap essay editor for surfaces outside DocumentEditor
 * (Library / Cite). Not persisted.
 */

import type { Editor } from "@tiptap/core";

let current: Editor | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function setEssayEditor(editor: Editor | null): void {
  if (current === editor) return;
  current = editor;
  emit();
}

export function getEssayEditor(): Editor | null {
  return current;
}

export function subscribeEssayEditor(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}
