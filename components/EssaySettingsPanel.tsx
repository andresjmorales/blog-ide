"use client";

import { useEffect, useState } from "react";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { SPELLCHECK_LANGUAGE_OPTIONS } from "@/lib/markdown/spellcheckFrontmatter";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  onTitleChange: (title: string) => void;
  documentLanguages: string[];
  onDocumentLanguagesChange: (languages: string[]) => void;
  canEditTitle?: boolean;
};

export function EssaySettingsPanel({
  open,
  onClose,
  title,
  onTitleChange,
  documentLanguages,
  onDocumentLanguagesChange,
  canEditTitle = true,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Remount when opened so the draft resets from `title` without an effect.
  return (
    <EssaySettingsDialog
      key={title}
      title={title}
      onClose={onClose}
      onTitleChange={onTitleChange}
      documentLanguages={documentLanguages}
      onDocumentLanguagesChange={onDocumentLanguagesChange}
      canEditTitle={canEditTitle}
    />
  );
}

function EssaySettingsDialog({
  title,
  onClose,
  onTitleChange,
  documentLanguages,
  onDocumentLanguagesChange,
  canEditTitle,
}: {
  title: string;
  onClose: () => void;
  onTitleChange: (title: string) => void;
  documentLanguages: string[];
  onDocumentLanguagesChange: (languages: string[]) => void;
  canEditTitle: boolean;
}) {
  const { prefs } = useEditorPrefs();
  const [draftTitle, setDraftTitle] = useState(title);

  const defaultLangs = prefs.spellcheckLanguages;
  const essayLangs =
    documentLanguages.length > 0 ? documentLanguages : defaultLangs;

  function toggleDocumentLang(code: string) {
    const base =
      documentLanguages.length > 0 ? documentLanguages : defaultLangs;
    const next = base.includes(code)
      ? base.filter((item) => item !== code)
      : [...base, code];
    onDocumentLanguagesChange(next.length > 0 ? next : [...defaultLangs]);
  }

  function commitTitle() {
    const next = draftTitle.trim();
    if (next && next !== title) onTitleChange(next);
  }

  return (
    <div className="settings-overlay" role="presentation">
      <button
        type="button"
        className="settings-backdrop"
        aria-label="Close essay settings"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="essay-settings-title"
        className="settings-panel"
      >
        <div className="settings-panel-header">
          <h2 id="essay-settings-title">Essay settings</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>

        <section className="settings-section">
          <h3>Title</h3>
          <p className="settings-help">
            Same as the Title field at the top of the essay. Changing it
            renames the file in the Files panel.
          </p>
          <label className="settings-row settings-row-stack">
            <span className="sr-only">Essay title</span>
            <input
              type="text"
              value={draftTitle}
              disabled={!canEditTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTitle();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="settings-text-input"
            />
          </label>
          {!canEditTitle && (
            <p className="settings-help">
              The scratchpad keeps a fixed file name.
            </p>
          )}
        </section>

        <section className="settings-section">
          <h3>Spell check</h3>
          {!prefs.spellcheckEnabled ? (
            <p className="settings-help">
              Spell check is off globally. Turn it on under Account settings.
            </p>
          ) : (
            <>
              <p className="settings-help">
                Languages for this essay (stored in frontmatter). Defaults from
                Account settings apply when none are set.
              </p>
              <div className="spellcheck-langs">
                {SPELLCHECK_LANGUAGE_OPTIONS.map((option) => (
                  <label key={option.code}>
                    <input
                      type="checkbox"
                      checked={essayLangs.includes(option.code)}
                      onChange={() => toggleDocumentLang(option.code)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
