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

/**
 * Surfaces that own Ctrl/Cmd+F even though they are portaled outside the
 * editor shell (floating footnote cards, the find bar itself).
 */
const FIND_HOTKEY_SURFACES =
  ".blogide-find-replace, .footnote-pin, .footnote-card";

/**
 * Whether Ctrl/Cmd+F should open BlogIDE Find instead of the browser bar.
 * Essay, find bar, and footnote cards yes; AI / explorer inputs no.
 */
export function isFindHotkeyTarget(
  target: EventTarget | null,
  shell: Node | null
): boolean {
  if (!(target instanceof Node)) return true;
  if (shell?.contains(target)) return true;
  if (
    target instanceof Element &&
    target.closest(FIND_HOTKEY_SURFACES)
  ) {
    return true;
  }
  if (
    target === document.body ||
    target === document.documentElement ||
    !(target instanceof HTMLElement)
  ) {
    return true;
  }
  return (
    !target.closest("input, textarea, select, [contenteditable='true']") &&
    !target.isContentEditable
  );
}
