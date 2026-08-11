"use client";

import { useEffect, useState } from "react";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import {
  SPELLCHECK_LANGUAGE_OPTIONS,
  promoteSpellcheckLanguage,
  toggleSpellcheckLanguage,
  type SpellcheckOverride,
} from "@/lib/markdown/spellcheckFrontmatter";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  onTitleChange: (title: string) => void;
  documentLanguages: string[];
  onDocumentLanguagesChange: (languages: string[]) => void;
  spellcheckOverride: SpellcheckOverride;
  onSpellcheckOverrideChange: (override: SpellcheckOverride) => void;
  canEditTitle?: boolean;
};

export function EssaySettingsPanel({
  open,
  onClose,
  title,
  onTitleChange,
  documentLanguages,
  onDocumentLanguagesChange,
  spellcheckOverride,
  onSpellcheckOverrideChange,
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
      spellcheckOverride={spellcheckOverride}
      onSpellcheckOverrideChange={onSpellcheckOverrideChange}
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
  spellcheckOverride,
  onSpellcheckOverrideChange,
  canEditTitle,
}: {
  title: string;
  onClose: () => void;
  onTitleChange: (title: string) => void;
  documentLanguages: string[];
  onDocumentLanguagesChange: (languages: string[]) => void;
  spellcheckOverride: SpellcheckOverride;
  onSpellcheckOverrideChange: (override: SpellcheckOverride) => void;
  canEditTitle: boolean;
}) {
  const { prefs } = useEditorPrefs();
  const [draftTitle, setDraftTitle] = useState(title);

  const defaultLangs = prefs.spellcheckLanguages;
  const essayLangs =
    documentLanguages.length > 0 ? documentLanguages : defaultLangs;
  const inheritingLangs = documentLanguages.length === 0;
  const primary = essayLangs[0] ?? "en-US";

  const effectiveEnabled =
    spellcheckOverride === "on"
      ? true
      : spellcheckOverride === "off"
        ? false
        : prefs.spellcheckEnabled;

  function toggleDocumentLang(code: string) {
    const next = toggleSpellcheckLanguage(
      documentLanguages,
      defaultLangs,
      code
    );
    onDocumentLanguagesChange(next);
  }

  function setPrimaryLang(code: string) {
    if (documentLanguages.length === 0) {
      // Materialize defaults with the chosen language first.
      onDocumentLanguagesChange(
        promoteSpellcheckLanguage(
          [code, ...defaultLangs.filter((item) => item !== code)],
          code
        )
      );
      return;
    }
    onDocumentLanguagesChange(
      promoteSpellcheckLanguage(documentLanguages, code)
    );
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
          <label className="settings-row">
            <span>For this essay</span>
            <select
              value={spellcheckOverride ?? "inherit"}
              onChange={(event) => {
                const value = event.target.value;
                onSpellcheckOverrideChange(
                  value === "on" ? "on" : value === "off" ? "off" : null
                );
              }}
            >
              <option value="inherit">
                Inherit account default (
                {prefs.spellcheckEnabled ? "on" : "off"})
              </option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </label>

          {!effectiveEnabled ? (
            <p className="settings-help">
              Spell check is off for this essay
              {spellcheckOverride === null && !prefs.spellcheckEnabled
                ? " (account default). Turn it on here or under Editor settings."
                : "."}
            </p>
          ) : (
            <>
              <p className="settings-help">
                Languages for this essay (stored in frontmatter). The primary
                language sets the browser dictionary. Selecting a language makes
                it primary.
                {inheritingLangs
                  ? " Showing account defaults until you change them."
                  : ""}
              </p>
              <div className="spellcheck-langs is-detailed">
                {SPELLCHECK_LANGUAGE_OPTIONS.map((option) => {
                  const checked = essayLangs.includes(option.code);
                  const isPrimary = checked && option.code === primary;
                  return (
                    <label key={option.code}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDocumentLang(option.code)}
                      />
                      <span>{option.label}</span>
                      {isPrimary && (
                        <span className="spellcheck-primary-badge">
                          primary
                        </span>
                      )}
                      {checked && !isPrimary && (
                        <button
                          type="button"
                          className="spellcheck-make-primary"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setPrimaryLang(option.code);
                          }}
                        >
                          Make primary
                        </button>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="settings-help">
                Uses the browser&apos;s built-in spell checker. Install the
                language pack in your OS or browser if suggestions look wrong
                (Chrome often follows its own language settings more than the
                page language). Grammar suggestions (blue underlines) are not
                built in yet; open-source options include Harper and
                LanguageTool if we add that later.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
