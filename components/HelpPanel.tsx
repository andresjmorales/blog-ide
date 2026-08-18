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
            footnote card to freeze it on screen while you scroll. Document and
            link pins keep their layout if you reload the tab.
          </p>
        </section>

        <section className="settings-section">
          <h3>Files</h3>
          <p className="settings-help">
            Use the icon buttons (new document / new folder) or hover a folder
            for the same actions. New document can also Import from .md / .txt /
            .docx (Word needs Pandoc on the server). Nest folders (e.g.
            essays/Veganism/). Pop out any document to keep a scratchpad
            floating. Right-click a folder or essay to map it to a GitHub
            path, pull with a diff, or push a backup (token stays on this
            device). Mapped items show a small GitHub icon: green if the path
            is still there, orange with a slash if git moved or deleted it.
            Click a
            link (or Ctrl+K) for the link menu with Open Graph preview, Open,
            Pin, and Library. The{" "}
            <strong>Library</strong> panel (right dock) holds
            research PDFs and bookmarks. Use ⋯ → Preview in new tab for
            publication-style HTML. Copy → All text copies the markdown. Copy →
            Substack / Medium (⋯ or Cleanup → Publish) turns GFM footnotes into
            numbered notes for that platform. Export Word when Pandoc is
            installed, or Push to GitHub. Edits save locally first, then sync
            online.
          </p>
        </section>

        <section className="settings-section">
          <h3>Notes &amp; Shell</h3>
          <p className="settings-help">
            Notes to self land in Notes channels (default <code>general</code>) as
            a chat-style stream — open the <strong>Notes</strong> panel from the
            Panels menu. Channel files are managed from the Notes manager icon in
            that panel (new channel, open channel doc, rename, trash), not from
            the Files tree. On phone, the header Notes button opens capture mode;
            Shell can open by default (Settings → Account → Mobile). A pinned
            scratchpad.md is seeded for scraps; treat it like any other essay.
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
              <kbd>Ctrl</kbd>+<kbd>F</kbd> / <kbd>H</kbd>: find / replace
              (soft highlights; Enter = next match)
            </li>
            <li>
              <kbd>Ctrl</kbd>+<kbd>\</kbd>: toggle markdown split / rich text
            </li>
            <li>
              Broom / Cleanup: pinnable tabs for Import, Text, Punctuation,
              and Publish check; Text → Clean whitespace joins wrapped lines
              to spaces and keeps blank lines; Cc = convert case; Cite is its
              own button
            </li>
            <li>
              <kbd>?</kbd>: shortcut cheatsheet (when not typing in the essay)
            </li>
            <li>
              Paste or drag an image into the essay to upload (select it to add
              alt text). Offline inserts stay in the essay until you reconnect.
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
