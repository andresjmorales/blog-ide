"use client";

import { useEffect, useState } from "react";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import type { SidenoteLayout } from "@/lib/settings";
import { SPELLCHECK_LANGUAGE_OPTIONS } from "@/lib/markdown/spellcheckFrontmatter";
import {
  loadAiKeys,
  maskKey,
  saveAiKeys,
  type AiKeys,
  type AiProvider,
} from "@/lib/ai/keys";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SettingsPanel({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Remount so drafts reset from localStorage without syncing in an effect.
  return <SettingsDialog key={String(open)} onClose={onClose} />;
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { prefs, updatePrefs } = useEditorPrefs();
  const [aiKeys, setAiKeys] = useState<AiKeys>(() => loadAiKeys());
  const [anthropicDraft, setAnthropicDraft] = useState("");
  const [openaiDraft, setOpenaiDraft] = useState("");
  const [keysSaved, setKeysSaved] = useState(false);

  const defaultLangs = prefs.spellcheckLanguages;

  function toggleDefaultLang(code: string) {
    const next = defaultLangs.includes(code)
      ? defaultLangs.filter((item) => item !== code)
      : [...defaultLangs, code];
    updatePrefs({
      spellcheckLanguages: next.length > 0 ? next : ["en-US"],
    });
  }

  function saveKeys() {
    const patch: AiKeys = {
      preferred: aiKeys.preferred,
      importAssist: aiKeys.importAssist,
    };
    if (anthropicDraft.trim()) patch.anthropic = anthropicDraft.trim();
    if (openaiDraft.trim()) patch.openai = openaiDraft.trim();
    const next = saveAiKeys(patch);
    setAiKeys(next);
    setAnthropicDraft("");
    setOpenaiDraft("");
    setKeysSaved(true);
  }

  function clearProvider(provider: AiProvider) {
    const next = saveAiKeys({
      ...aiKeys,
      [provider]: "",
    });
    setAiKeys(next);
    if (provider === "anthropic") setAnthropicDraft("");
    else setOpenaiDraft("");
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
          <h3>AI API keys</h3>
          <p className="settings-help">
            Bring your own Anthropic and/or OpenAI key. Keys are stored only in
            this browser and sent to the provider when you use the assistant —
            never saved to BlogIDE&apos;s database.
          </p>
          <label className="settings-row settings-row-stack">
            <span>Anthropic API key</span>
            <input
              type="password"
              autoComplete="off"
              placeholder={
                aiKeys.anthropic
                  ? `Saved · ${maskKey(aiKeys.anthropic)}`
                  : "sk-ant-…"
              }
              value={anthropicDraft}
              onChange={(e) => setAnthropicDraft(e.target.value)}
              className="settings-text-input"
            />
            {aiKeys.anthropic && (
              <button
                type="button"
                className="settings-link-btn"
                onClick={() => clearProvider("anthropic")}
              >
                Remove Anthropic key
              </button>
            )}
          </label>
          <label className="settings-row settings-row-stack">
            <span>OpenAI API key</span>
            <input
              type="password"
              autoComplete="off"
              placeholder={
                aiKeys.openai ? `Saved · ${maskKey(aiKeys.openai)}` : "sk-…"
              }
              value={openaiDraft}
              onChange={(e) => setOpenaiDraft(e.target.value)}
              className="settings-text-input"
            />
            {aiKeys.openai && (
              <button
                type="button"
                className="settings-link-btn"
                onClick={() => clearProvider("openai")}
              >
                Remove OpenAI key
              </button>
            )}
          </label>
          <label className="settings-row">
            <span>Preferred provider</span>
            <select
              value={aiKeys.preferred ?? "anthropic"}
              onChange={(e) => {
                const preferred = e.target.value as AiProvider;
                const next = saveAiKeys({ ...aiKeys, preferred });
                setAiKeys(next);
              }}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <label className="settings-row">
            <span>AI import assist</span>
            <input
              type="checkbox"
              checked={Boolean(aiKeys.importAssist)}
              onChange={(e) => {
                const next = saveAiKeys({
                  ...aiKeys,
                  importAssist: e.target.checked,
                });
                setAiKeys(next);
              }}
            />
          </label>
          <p className="settings-help">
            When on, Clean import / Fix notes can ask the model to rewrite messy
            Substack or Docs paste (footnote links, headings, indented quotes).
            Deterministic paste conversion still runs either way.
          </p>
          <button
            type="button"
            className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
            onClick={saveKeys}
          >
            Save API keys
          </button>
          {keysSaved && (
            <p className="mt-2 text-xs text-muted">Keys saved on this device.</p>
          )}
        </section>

        <section className="settings-section">
          <h3>Mobile</h3>
          <label className="settings-row">
            <span>Open Shell on phone</span>
            <input
              type="checkbox"
              checked={prefs.mobileOpenShell}
              onChange={(event) =>
                updatePrefs({ mobileOpenShell: event.target.checked })
              }
            />
          </label>
          <p className="settings-help">
            When on, phone-sized windows land on the Shell terminal first. Turn
            off to open the editor instead. You can still switch with Shell /
            Enter full app.
          </p>
        </section>

        <section className="settings-section">
          <h3>Sidebar / Sidenotes</h3>
          <p className="settings-help">
            The scrollable rail lists every footnote. When linked, essay scroll
            smoothly drives the rail; unlock it to scroll notes independently.
            Anchored places each note beside its mark.
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
              <option value="sticky">Scrollable rail</option>
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
