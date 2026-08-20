"use client";

import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { SettingsLabel } from "@/components/SettingsInfo";
import type { MarkdownTypingShortcuts } from "@/lib/settings";
import { HARPER_LANGUAGE_OPTIONS } from "@/lib/editor/harper/dialect";
import { toggleSpellcheckLanguage } from "@/lib/markdown/spellcheckFrontmatter";

/** Workspace-wide markdown typing and view prefs. */
export function MarkdownPrefsSection() {
  const { prefs, updatePrefs } = useEditorPrefs();

  return (
    <>
      <section className="settings-section">
        <h3>Typing</h3>
        <div className="settings-row">
          <SettingsLabel
            info="Auto-transforms while typing in rich text. Conservative keeps lists, headings, and code shortcuts. Full also wraps bold, italic, and strike, and starts blockquotes or horizontal rules from markdown punctuation. Toolbar formatting always works."
          >
            Shortcuts
          </SettingsLabel>
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
        </div>
        <div className="settings-row">
          <SettingsLabel
            info="While typing: curly quotes, em dashes from --, ellipsis, arrows, and a few symbols. Backspace or Ctrl+Z right after a replacement restores what you typed. Cleanup → Punctuation is a separate pass on a selection."
          >
            Typography
          </SettingsLabel>
          <input
            type="checkbox"
            checked={prefs.typography}
            onChange={(event) =>
              updatePrefs({ typography: event.target.checked })
            }
          />
        </div>
      </section>

      <section className="settings-section">
        <h3>Views</h3>
        <div className="settings-row">
          <SettingsLabel
            info="View raw markdown opens a split (editable source beside a live preview). On a phone the preview is a sliver; Rich text returns to the full editor. Full-pane markdown-only is an advanced escape hatch."
          >
            Allow markdown-only mode
          </SettingsLabel>
          <input
            type="checkbox"
            checked={prefs.allowMarkdownOnly ?? false}
            onChange={(event) =>
              updatePrefs({ allowMarkdownOnly: event.target.checked })
            }
          />
        </div>
      </section>
    </>
  );
}

/** Workspace-wide editor, writing-check, and phone prefs. */
export function EditorPrefsSection() {
  const { prefs, updatePrefs } = useEditorPrefs();
  const defaultLangs = prefs.spellcheckLanguages;
  const primary = defaultLangs[0] ?? "en-US";

  function toggleDefaultLang(code: string) {
    const next = toggleSpellcheckLanguage(defaultLangs, ["en-US"], code);
    updatePrefs({
      spellcheckLanguages: next.length > 0 ? next : ["en-US"],
    });
  }

  function setPrimary(code: string) {
    updatePrefs({
      spellcheckLanguages: [
        code,
        ...defaultLangs.filter((item) => item !== code),
      ],
    });
  }

  return (
    <section className="settings-section">
      <div className="settings-row">
        <SettingsLabel info="Open the footnote editor card when the pointer rests on a superscript.">
          Open footnote on hover
        </SettingsLabel>
        <input
          type="checkbox"
          checked={prefs.footnoteOpenOnHover}
          onChange={(event) =>
            updatePrefs({ footnoteOpenOnHover: event.target.checked })
          }
        />
      </div>
      <div className="settings-row">
        <SettingsLabel
          info="When on, phone-sized windows land on the Notes capture terminal first. Turn off to open the editor instead. You can still switch with Notes / Enter full app."
        >
          Open Notes on phone
        </SettingsLabel>
        <input
          type="checkbox"
          checked={prefs.mobileOpenShell}
          onChange={(event) =>
            updatePrefs({ mobileOpenShell: event.target.checked })
          }
        />
      </div>
      <div className="settings-row">
        <SettingsLabel
          info="On-device English spelling and grammar via Harper (not the browser dictionary). First selected dialect is primary. Override per essay under Essay settings. Other languages may come later via a separate dictionary checker."
        >
          Writing check
        </SettingsLabel>
        <input
          type="checkbox"
          checked={prefs.spellcheckEnabled}
          onChange={(event) =>
            updatePrefs({ spellcheckEnabled: event.target.checked })
          }
        />
      </div>
      {prefs.spellcheckEnabled && (
        <div className="spellcheck-langs is-detailed">
          {HARPER_LANGUAGE_OPTIONS.map((option) => {
            const checked = defaultLangs.includes(option.code);
            const isPrimary = checked && option.code === primary;
            return (
              <label key={option.code}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleDefaultLang(option.code)}
                />
                <span>{option.label}</span>
                {isPrimary && (
                  <span className="spellcheck-primary-badge">primary</span>
                )}
                {checked && !isPrimary && (
                  <button
                    type="button"
                    className="spellcheck-make-primary"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setPrimary(option.code);
                    }}
                  >
                    Make primary
                  </button>
                )}
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
