"use client";

import { useEffect } from "react";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import type { SidenoteLayout } from "@/lib/settings";
import { SPELLCHECK_LANGUAGE_OPTIONS } from "@/lib/markdown/spellcheckFrontmatter";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Languages for the open essay (frontmatter). */
  documentLanguages?: string[];
  onDocumentLanguagesChange?: (languages: string[]) => void;
  hasOpenDocument?: boolean;
};

export function SettingsPanel({
  open,
  onClose,
  documentLanguages = [],
  onDocumentLanguagesChange,
  hasOpenDocument = false,
}: Props) {
  const { prefs, updatePrefs } = useEditorPrefs();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const defaultLangs = prefs.spellcheckLanguages;

  function toggleDefaultLang(code: string) {
    const next = defaultLangs.includes(code)
      ? defaultLangs.filter((item) => item !== code)
      : [...defaultLangs, code];
    updatePrefs({
      spellcheckLanguages: next.length > 0 ? next : ["en-US"],
    });
  }

  function toggleDocumentLang(code: string) {
    if (!onDocumentLanguagesChange) return;
    const base =
      documentLanguages.length > 0 ? documentLanguages : defaultLangs;
    const next = base.includes(code)
      ? base.filter((item) => item !== code)
      : [...base, code];
    onDocumentLanguagesChange(next.length > 0 ? next : [...defaultLangs]);
  }

  const essayLangs =
    documentLanguages.length > 0 ? documentLanguages : defaultLangs;

  return (
    <div className="settings-overlay" role="presentation">
      <button
        type="button"
        className="settings-backdrop"
        aria-label="Close settings"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="settings-panel"
      >
        <div className="settings-panel-header">
          <h2 id="settings-title">Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close settings">
            Close
          </button>
        </div>

        <section className="settings-section">
          <h3>Sidebar / Sidenotes</h3>
          <p className="settings-help">
            Sticky packing keeps margin notes on screen as you scroll. Floating
            footnote editors are unchanged.
          </p>
          <label className="settings-row">
            <span>Show sidenotes</span>
            <input
              type="checkbox"
              checked={prefs.sidenotes}
              onChange={(event) =>
                updatePrefs({ sidenotes: event.target.checked })
              }
            />
          </label>
          <label className="settings-row">
            <span>Sidenote layout</span>
            <select
              value={prefs.sidenoteLayout}
              disabled={!prefs.sidenotes}
              onChange={(event) =>
                updatePrefs({
                  sidenoteLayout: event.target.value as SidenoteLayout,
                })
              }
            >
              <option value="sticky">Sticky (proximity packing)</option>
              <option value="anchored">Anchored to footnotes</option>
            </select>
          </label>
        </section>

        <section className="settings-section">
          <h3>Editor</h3>
          <label className="settings-row">
            <span>Open footnote on hover</span>
            <input
              type="checkbox"
              checked={prefs.footnoteOpenOnHover}
              onChange={(event) =>
                updatePrefs({ footnoteOpenOnHover: event.target.checked })
              }
            />
          </label>
          <label className="settings-row">
            <span>Spell check</span>
            <input
              type="checkbox"
              checked={prefs.spellcheckEnabled}
              onChange={(event) =>
                updatePrefs({ spellcheckEnabled: event.target.checked })
              }
            />
          </label>
          {prefs.spellcheckEnabled && (
            <>
              <p className="settings-help">
                Uses the browser dictionary. Pick default languages for new
                essays; override per open document below.
              </p>
              <p className="mb-1.5 text-xs text-muted">Default languages</p>
              <div className="spellcheck-langs mb-3">
                {SPELLCHECK_LANGUAGE_OPTIONS.map((option) => (
                  <label key={option.code}>
                    <input
                      type="checkbox"
                      checked={defaultLangs.includes(option.code)}
                      onChange={() => toggleDefaultLang(option.code)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {hasOpenDocument && onDocumentLanguagesChange && (
                <>
                  <p className="mb-1.5 text-xs text-muted">
                    Languages for this essay
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
            </>
          )}
        </section>

        <section className="settings-section">
          <h3>Appearance</h3>
          <p className="settings-help">
            Use the sun/moon control in the top bar to switch light and dark
            theme.
          </p>
        </section>
      </div>
    </div>
  );
}
