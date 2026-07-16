"use client";

import { useEffect } from "react";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import type { SidenoteLayout } from "@/lib/settings";
import { SPELLCHECK_LANGUAGE_OPTIONS } from "@/lib/markdown/spellcheckFrontmatter";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SettingsPanel({ open, onClose }: Props) {
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

  return (
    <div className="settings-overlay" role="presentation">
      <button
        type="button"
        className="settings-backdrop"
        aria-label="Close account settings"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="settings-panel"
      >
        <div className="settings-panel-header">
          <h2 id="settings-title">Account settings</h2>
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
                Default languages for new essays. Override languages for the
                open essay under Essay settings in the toolbar.
              </p>
              <div className="spellcheck-langs">
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
            </>
          )}
        </section>
      </div>
    </div>
  );
}
