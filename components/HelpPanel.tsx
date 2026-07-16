"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function HelpPanel({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="settings-overlay" role="presentation">
      <button
        type="button"
        className="settings-backdrop"
        aria-label="Close help"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="settings-panel"
      >
        <div className="settings-panel-header">
          <h2 id="help-title">Help</h2>
          <button type="button" onClick={onClose} aria-label="Close help">
            Close
          </button>
        </div>

        <section className="settings-section">
          <h3>Writing</h3>
          <p className="settings-help">
            BlogIDE is a markdown-native essay editor. Use the toolbar for
            formatting, or switch to Source for raw markdown. The essay title
            and the file name stay in sync.
          </p>
        </section>

        <section className="settings-section">
          <h3>Footnotes</h3>
          <p className="settings-help">
            Insert a footnote from the toolbar (or Ctrl+Shift+F). Hover to
            preview; click to keep the editor open. Pin or drag to keep a note
            on screen while you write. Margin sidenotes can be toggled in
            Account settings.
          </p>
        </section>

        <section className="settings-section">
          <h3>Files</h3>
          <p className="settings-help">
            Right-click the Files panel to move items, send them to Trash, or
            delete permanently. Edits save locally first, then sync to your
            cloud workspace when online.
          </p>
        </section>

        <section className="settings-section">
          <h3>Shortcuts</h3>
          <ul className="settings-help list-disc space-y-1 pl-4">
            <li>
              <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd> — bold / italic
            </li>
            <li>
              <kbd>Ctrl</kbd>+<kbd>K</kbd> — link
            </li>
            <li>
              <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> — footnote
            </li>
            <li>
              <kbd>Esc</kbd> — close floating footnote / dialogs
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
