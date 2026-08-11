"use client";

import { useEditorPrefs } from "@/components/EditorPrefsContext";
import type { MarkdownTypingShortcuts } from "@/lib/settings";
import { SPELLCHECK_LANGUAGE_OPTIONS } from "@/lib/markdown/spellcheckFrontmatter";

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Workspace-wide writing prefs (not account billing, not per-essay). */
export function EditorSettingsPanel({ open, onClose }: Props) {
  const { prefs, updatePrefs } = useEditorPrefs();
  const defaultLangs = prefs.spellcheckLanguages;

  if (!open) return null;

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
        aria-label="Close editor settings"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-settings-title"
        className="settings-panel"
      >
        <div className="settings-panel-header">
          <h2 id="editor-settings-title">Editor settings</h2>
          <button type="button" onClick={onClose} aria-label="Close settings">
            Close
          </button>
        </div>

        <section className="settings-section">
          <h3>Markdown typing</h3>
          <p className="settings-help">
            Auto-transforms while typing in rich text (TipTap input rules).
            Conservative keeps lists, headings, and code shortcuts; Full also
            wraps bold/italic/strike and starts blockquotes / horizontal rules
            from markdown punctuation. Toolbar formatting always works.
          </p>
          <label className="settings-row">
            <span>Shortcuts</span>
            <select
              value={prefs.markdownTypingShortcuts}
              onChange={(event) =>
                updatePrefs({
                  markdownTypingShortcuts: event.target
                    .value as MarkdownTypingShortcuts,
                })
              }
            >
              <option value="conservative">Conservative (default)</option>
              <option value="full">Full</option>
            </select>
          </label>
        </section>

        <section className="settings-section">
          <h3>Markdown views</h3>
          <p className="settings-help">
            “View raw markdown” opens a split (editable source beside a live
            preview). Full-pane markdown-only is an advanced escape hatch.
          </p>
          <label className="settings-row">
            <span>Allow markdown-only mode</span>
            <input
              type="checkbox"
              checked={prefs.allowMarkdownOnly ?? false}
              onChange={(event) =>
                updatePrefs({ allowMarkdownOnly: event.target.checked })
              }
            />
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
          <label className="settings-row">
            <span>Dash style (punctuation normalize)</span>
            <select
              value={prefs.dashStyle}
              onChange={(event) =>
                updatePrefs({
                  dashStyle: event.target.value as "chicago" | "mla",
                })
              }
            >
              <option value="chicago">Chicago (em dash —)</option>
              <option value="mla">MLA (spaced en dash –)</option>
            </select>
          </label>
          {prefs.spellcheckEnabled && (
            <>
              <p className="settings-help">
                Default languages for new essays. The first selected language is
                primary for the browser dictionary. Override on/off and
                languages per essay under Essay settings.
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
