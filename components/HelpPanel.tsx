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
            on screen while you write. The sidenote rail lists every note; keep
            it Linked to scroll with the essay, or Free to browse notes on their
            own. Deleted notes for the current essay stay in a collapsed section
            at the bottom of the rail so you can restore or dismiss them. Pin a
            footnote card to freeze it on screen while you scroll.
          </p>
        </section>

        <section className="settings-section">
          <h3>Files</h3>
          <p className="settings-help">
            Use the icon buttons (new document / new folder) or hover a folder
            for the same actions. New document can also Import from .md / .txt.
            Nest folders (e.g. essays/Veganism/). Pop out any document to keep a
            scratchpad floating. Hover links for Open Graph previews. Pin keeps
            them on screen. Open <strong>Library</strong> from the Panels menu to
            pin local PDFs. Use ⋯ → Preview in new tab for publication-style HTML
            with Substack-like footnotes. Edits save locally first, then sync
            online.
          </p>
        </section>

        <section className="settings-section">
          <h3>Notes &amp; Shell</h3>
          <p className="settings-help">
            Notes to self land in Notes channels (default <code>general</code>) as
            a chat-style stream. On desktop, open <strong>Shell</strong> /{" "}
            <strong>Notes</strong> from the Panels menu (pop out or dock under
            the essay. Outline and the footnotes rail stay full-height beside a
            docked Shell). On phone, the header Notes button stays available, and
            Shell can open by default (Account settings → Mobile). Scratchpad
            stays for writing scraps.
          </p>
        </section>

        <section className="settings-section">
          <h3>Shortcuts</h3>
          <ul className="settings-help list-disc space-y-1 pl-4">
            <li>
              <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd>: bold / italic
            </li>
            <li>
              <kbd>Ctrl</kbd>+<kbd>K</kbd>: link
            </li>
            <li>
              <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>: footnote
            </li>
            <li>
              <kbd>Esc</kbd>: close floating footnote / dialogs
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
