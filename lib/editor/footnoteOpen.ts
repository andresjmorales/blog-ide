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

/** Open a mounted footnote's card near an element (e.g. its rail row). */
type FootnoteCardOpener = (anchorEl: HTMLElement | null) => void;

const openers = new Map<string, FootnoteCardOpener>();

export function registerFootnoteCardOpener(
  id: string,
  open: FootnoteCardOpener
): () => void {
  openers.set(id, open);
  return () => {
    if (openers.get(id) === open) openers.delete(id);
  };
}

/** Returns false when no mounted footnote has that id. */
export function openFootnoteCardNear(
  id: string,
  anchorEl: HTMLElement | null
): boolean {
  const open = openers.get(id);
  if (!open) return false;
  open(anchorEl);
  return true;
}
