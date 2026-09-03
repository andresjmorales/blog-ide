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
            Insert a footnote from the toolbar (or Ctrl+Shift+F). The editor
            opens right away. Hover a number to preview; click to keep it open.
            Drag the green number to move that note to another spot in the
            essay. The numbers (and any open footnote editors) update to match
            the new order; the note text stays with its mark. Pin keeps the
            note open when you click back into the essay. Unpin leaves it where
            it is until you click the essay again. The sidenote rail lists
            every note; keep it Linked to scroll with the essay, or Free to
            browse notes on their own. Deleted notes for the current essay stay
            in a collapsed section at the bottom of the rail so you can restore
            or dismiss them. Document and link pins keep their layout if you
            reload the tab.
          </p>
        </section>

        <section className="settings-section">
          <h3>Files</h3>
          <p className="settings-help">
            Use the icon buttons (new document / new folder) or hover a folder
            for the same actions. New document can also Import from .md / .txt /
            .docx (Word needs Pandoc on the server). Nest folders (e.g.
            essays/Veganism/). Pop out any document to keep a scratchpad
            floating. Right-click a folder or essay and use GitHub → Map,
            Pull, or Push (token stays on this device).
            The open essay can also be mapped under Essay settings → GitHub.
            Mapped items show a small GitHub icon: green if the path
            is still there, orange with a slash if git moved or deleted it.
            Two essays with the same file name get an “also …” chip so a
            workspace copy is obvious; GitHub extras under a mapped folder
            are listed and never imported as a new essay. Click a
            link (or Ctrl+K) for the link menu with Open Graph preview, Open,
            Pin, and Library. The{" "}
            <strong>Library</strong> panel (right dock, or pop it out) is
            one list of saved links, PDFs, Zotero hits, and pasted BibTeX.
            Expand a row to cite, open, or remove it. Cited here is the
            bibliography for footnotes already in the essay (Copy list).
            Toolbar Cite opens that panel (or a sheet on a phone). Use the essay
            menu → Preview in new tab for
            publication-style HTML. Copy → Rich text is the same formatted
            paste as selecting the essay and copying. Copy → Markdown copies
            the source. Copy → HTML pastes publication HTML. Prepare publish
            opens Cleanup → Publish
            for footnote copy formats (bracketed [1], superscripts, linked
            endnotes) and Substack native-footnote steps. Export Word when Pandoc is
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
            Shell can open by default (Settings → Editor). A pinned
            scratchpad.md is seeded for scraps; treat it like any other essay.
            Optional Pushbullet or ntfy capture (Settings → Integrations)
            maps a virtual device or an ntfy topic to each Notes channel. Send
            from the Pushbullet or ntfy app with BlogIDE closed; the next time
            you open BlogIDE on a computer or phone, those notes catch up.
            Tokens and topic names are encrypted on your account after you paste
            them into Settings, never into a chat. Notes refresh pulls
            Pushbullet and ntfy immediately; background catch-up is every couple
            of minutes if the live stream is blocked. Create a Pushbullet token on
            the Pushbullet account page (Settings → Account). Ad blockers such
            as uBlock Origin often block Pushbullet’s hosts; BlogIDE talks to
            Pushbullet through this site so you usually do not need to disable
            the blocker. If Test token still fails, open the circled ? next to
            Pushbullet in Settings.
          </p>
        </section>

        <section className="settings-section">
          <h3>Shortcuts</h3>
          <ul className="settings-help list-disc space-y-1 pl-4">
            <li>
              <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd>: bold / italic
            </li>
            <li>
              <kbd>Ctrl</kbd>+<kbd>.</kbd> / <kbd>,</kbd>: superscript /
              subscript
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
              to spaces and keeps blank lines; Aa+ = extra formatting (inline
              code, superscript, subscript, code block, convert case) and is
              customizable under Settings → Editor; Cite opens the
              Library panel (or a sheet on a phone) to search Zotero,
              saved items, or paste BibTeX, insert a footnote, or copy a
              Chicago note
            </li>
            <li>
              <kbd>?</kbd>: shortcut cheatsheet (when not typing in the essay)
            </li>
            <li>
              Paste or drag an image into the essay to upload (select it to add
              alt text). Offline inserts stay in the essay until you reconnect.
            </li>
            <li>
              fetch(bible) (Settings → Integrations, off by default): highlights
              English scripture references; essay menu → Open Bible opens the pinned
              reader (Berean Standard Bible)
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
