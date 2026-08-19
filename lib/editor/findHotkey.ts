/**
 * Find/replace vs footnote hotkeys share Ctrl/Cmd+F unless Shift is ignored.
 * Ctrl+Shift+F is insert-footnote; Ctrl+F / Ctrl+H open find.
 */

export type HotkeyEvent = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

export function isModKey(event: HotkeyEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

/** Ctrl/Cmd+F (not Shift) or Ctrl/Cmd+H. */
export function isFindReplaceHotkey(event: HotkeyEvent): boolean {
  if (!isModKey(event) || event.altKey) return false;
  const key = event.key.toLowerCase();
  if (key === "h") return true;
  if (key === "f") return !event.shiftKey;
  return false;
}

/** Ctrl/Cmd+Shift+F — insert a footnote and open its editor. */
export function isInsertFootnoteHotkey(event: HotkeyEvent): boolean {
  if (!isModKey(event) || event.altKey || !event.shiftKey) return false;
  return event.key.toLowerCase() === "f";
}
