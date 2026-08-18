/**
 * Docs/Word-style undo for the last input-rule replacement.
 *
 * Immediately after a substitution (smart quote, `--` → em dash, …):
 * Backspace or Ctrl/Cmd+Z restores the original characters. Typing more,
 * moving the caret, or waiting `lockAfterMs` locks the replacement in.
 */

import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";

export const DEFAULT_TYPOGRAPHY_LOCK_MS = 2000;

type UndoableInputRule = {
  transform: { steps: unknown[]; docs: unknown[] };
  from: number;
  to: number;
  text?: string;
};

export function peekUndoableInputRule(
  state: EditorState
): UndoableInputRule | null {
  for (const plugin of state.plugins) {
    const spec = plugin.spec as { isInputRules?: boolean };
    if (!spec.isInputRules) continue;
    const undoable = plugin.getState(state) as UndoableInputRule | null;
    if (undoable) return undoable;
  }
  return null;
}

/** Drop the pending input-rule undo without changing the document. */
export function lockInputRuleUndo(editor: Editor): boolean {
  if (editor.isDestroyed) return false;
  if (!peekUndoableInputRule(editor.state)) return false;
  editor.view.dispatch(
    editor.state.tr
      .setSelection(editor.state.selection)
      .setMeta("addToHistory", false)
  );
  return true;
}

export const UndoReplace = Extension.create({
  name: "undoReplace",
  // Beat History's Mod-z so the first undo reverts the substitution.
  priority: 1000,

  addOptions() {
    return { lockAfterMs: DEFAULT_TYPOGRAPHY_LOCK_MS };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-z": () => {
        if (this.editor.commands.undoInputRule()) return true;
        return this.editor.commands.undo();
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const lockAfterMs = this.options.lockAfterMs;
    const key = new PluginKey("undoReplaceExpire");
    return [
      new Plugin({
        key,
        view() {
          let timer = 0;
          function clear() {
            if (timer) window.clearTimeout(timer);
            timer = 0;
          }
          return {
            update(view, prevState) {
              const now = peekUndoableInputRule(view.state);
              const prev = peekUndoableInputRule(prevState);
              if (!now) {
                clear();
                return;
              }
              if (prev) return;
              if (lockAfterMs <= 0) return;
              clear();
              timer = window.setTimeout(() => {
                timer = 0;
                lockInputRuleUndo(editor);
              }, lockAfterMs);
            },
            destroy() {
              clear();
            },
          };
        },
      }),
    ];
  },
});
