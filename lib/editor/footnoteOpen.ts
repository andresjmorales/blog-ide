/**
 * Queue a footnote card to open when its NodeView mounts (insert / shortcut).
 */

const pending = new Set<string>();

export function queueFootnoteEditorOpen(id: string): void {
  pending.add(id);
}

export function consumeFootnoteEditorOpen(id: string): boolean {
  if (!pending.has(id)) return false;
  pending.delete(id);
  return true;
}

export function clearFootnoteEditorOpenQueue(): void {
  pending.clear();
}
