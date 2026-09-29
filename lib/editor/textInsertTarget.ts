/**
 * When a non-editor field (title, subtitle, find/replace, frontmatter) is
 * focused, special-character inserts should go there instead of the
 * ProseMirror doc. The Ω menu preventDefault()s mousedown so focus stays put.
 */

export type TextInsertPayload = {
  text: string;
  wrap?: { before: string; after: string };
};

type InsertHandler = (payload: TextInsertPayload) => boolean;

let activeTarget: InsertHandler | null = null;

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "email",
  "password",
  "tel",
  "number",
  "",
]);

export function setTextInsertTarget(handler: InsertHandler | null): void {
  activeTarget = handler;
}

export function isEditableTextControl(
  el: EventTarget | null
): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) {
    return !el.readOnly && !el.disabled;
  }
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.readOnly || el.disabled) return false;
  return TEXT_INPUT_TYPES.has((el.type || "text").toLowerCase());
}

/** Insert at the caret of a focused input/textarea, including wrap pairs. */
export function insertIntoTextControl(
  input: HTMLInputElement | HTMLTextAreaElement,
  payload: TextInsertPayload
): void {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const selected = input.value.slice(start, end);
  const nextChunk = payload.wrap
    ? payload.wrap.before + (selected || "") + payload.wrap.after
    : payload.text;
  const value =
    input.value.slice(0, start) + nextChunk + input.value.slice(end);
  const proto =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  const caret = payload.wrap
    ? start + payload.wrap.before.length + (selected ? selected.length : 0)
    : start + nextChunk.length;
  input.setSelectionRange(caret, caret);
  input.focus();
}

/**
 * Replace `[from, to)` in a textarea as if typed, so Ctrl+Z undoes it
 * (assigning `.value` wipes the native undo stack). Falls back to a plain
 * value write where `insertText` is unsupported.
 */
export function replaceTextControlRange(
  input: HTMLInputElement | HTMLTextAreaElement,
  from: number,
  to: number,
  text: string
): void {
  input.focus({ preventScroll: true });
  input.setSelectionRange(from, to);
  let ok = false;
  try {
    ok = text
      ? document.execCommand("insertText", false, text)
      : document.execCommand("delete", false);
  } catch {
    ok = false;
  }
  if (ok) return;
  const value = input.value.slice(0, from) + text + input.value.slice(to);
  const proto =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.setSelectionRange(from + text.length, from + text.length);
}

/**
 * Returns true if a focused text control or a registered target consumed
 * the insert. Focused inputs/textareas win so title/subtitle work even
 * while Find is mounted.
 */
export function tryInsertIntoTextTarget(payload: TextInsertPayload): boolean {
  if (typeof document !== "undefined") {
    const active = document.activeElement;
    if (isEditableTextControl(active)) {
      insertIntoTextControl(active, payload);
      return true;
    }
  }
  if (!activeTarget) return false;
  return activeTarget(payload);
}
