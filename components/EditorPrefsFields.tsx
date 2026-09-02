"use client";

import { useState } from "react";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { SettingsLabel } from "@/components/SettingsInfo";
import type { MarkdownTypingShortcuts } from "@/lib/settings";
import { HARPER_LANGUAGE_OPTIONS } from "@/lib/editor/harper/dialect";
import {
  addHarperDictionaryWord,
  removeHarperDictionaryWord,
} from "@/lib/editor/harper/dictionary";
import {
  HARPER_LINT_KIND_GROUPS,
  harperKindEnabled,
  setHarperKindEnabled,
} from "@/lib/editor/harper/kinds";
import { toggleSpellcheckLanguage } from "@/lib/markdown/spellcheckFrontmatter";
import { ToolbarLayoutEditor } from "@/components/ToolbarLayoutEditor";

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
      <h3>Toolbar</h3>
      <ToolbarLayoutEditor />
      <h3>Writing</h3>
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
          info="On-device English spelling and grammar via Harper. First selected dialect is primary. Override per essay under Essay settings. Turn off issue types you do not want, and add words to a dictionary shared across every essay."
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
        <>
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
          <HarperIssueTypeToggles />
          <HarperDictionaryField />
        </>
      )}
    </section>
  );
}

function HarperIssueTypeToggles() {
  const { prefs, updatePrefs } = useEditorPrefs();
  const disabled = prefs.harperDisabledKinds;

  return (
    <div className="harper-kind-groups">
      <p className="settings-section-subhead">
        <SettingsLabel info="Uncheck a type to hide those underlines in every essay. Readability is Harper's long-sentence check.">
          Issue types
        </SettingsLabel>
      </p>
      {HARPER_LINT_KIND_GROUPS.map((group) => (
        <fieldset key={group.id} className="harper-kind-group">
          <legend>{group.label}</legend>
          <div className="spellcheck-langs is-detailed">
            {group.kinds.map((kind) => {
              const checked = harperKindEnabled(disabled, kind.id);
              return (
                <label key={kind.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      updatePrefs({
                        harperDisabledKinds: setHarperKindEnabled(
                          disabled,
                          kind.id,
                          event.target.checked
                        ),
                      })
                    }
                  />
                  <span>{kind.label}</span>
                  {kind.hint && (
                    <span className="harper-kind-hint">{kind.hint}</span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function HarperDictionaryField() {
  const { prefs, updatePrefs } = useEditorPrefs();
  const [draft, setDraft] = useState("");
  const words = prefs.harperDictionary;

  function addDraft() {
    if (!draft.trim()) return;
    updatePrefs({
      harperDictionary: addHarperDictionaryWord(words, draft),
    });
    setDraft("");
  }

  return (
    <div className="harper-dictionary">
      <p className="settings-section-subhead">
        <SettingsLabel info="Words added here (or from a spelling suggestion) are ignored in every essay. Synced with your account.">
          Dictionary
        </SettingsLabel>
      </p>
      {words.length > 0 && (
        <ul className="harper-dictionary-list">
          {words.map((word) => (
            <li key={word}>
              <span>{word}</span>
              <button
                type="button"
                className="harper-dictionary-remove"
                aria-label={`Remove ${word} from dictionary`}
                onClick={() =>
                  updatePrefs({
                    harperDictionary: removeHarperDictionaryWord(words, word),
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="harper-dictionary-add"
        onSubmit={(event) => {
          event.preventDefault();
          addDraft();
        }}
      >
        <input
          type="text"
          className="settings-text-input"
          value={draft}
          placeholder="Add a word"
          aria-label="Add a word to the dictionary"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="settings-link-btn">
          Add
        </button>
      </form>
    </div>
  );
}
