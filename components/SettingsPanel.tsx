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
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Props = {
  open: boolean;
  onClose: () => void;
  email?: string;
  displayName?: string;
  previewMode?: boolean;
  onDisplayNameChange?: (name: string) => void;
};

export function SettingsPanel({
  open,
  onClose,
  email = "",
  displayName = "",
  previewMode = false,
  onDisplayNameChange,
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

  // Remount so drafts reset from localStorage without syncing in an effect.
  return (
    <SettingsDialog
      key={String(open)}
      onClose={onClose}
      email={email}
      displayName={displayName}
      previewMode={previewMode}
      onDisplayNameChange={onDisplayNameChange}
    />
  );
}

function SettingsDialog({
  onClose,
  email,
  displayName,
  previewMode,
  onDisplayNameChange,
}: {
  onClose: () => void;
  email: string;
  displayName: string;
  previewMode: boolean;
  onDisplayNameChange?: (name: string) => void;
}) {
  const { prefs, updatePrefs } = useEditorPrefs();
  const [aiKeys, setAiKeys] = useState<AiKeys>(() => loadAiKeys());
  const [anthropicDraft, setAnthropicDraft] = useState("");
  const [openaiDraft, setOpenaiDraft] = useState("");
  const [keysSaved, setKeysSaved] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [nameStatus, setNameStatus] = useState<string | null>(null);
  const [nameBusy, setNameBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

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
          <h3>Account</h3>
          {previewMode || !isSupabaseConfigured() ? (
            <p className="settings-help">
              Sign in with Supabase to edit your display name and password.
            </p>
          ) : (
            <>
              <label className="settings-row settings-row-stack">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="settings-text-input opacity-80"
                />
              </label>
              <label className="settings-row settings-row-stack">
                <span>Display name</span>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="settings-text-input"
                  placeholder="Your name"
                  autoComplete="name"
                />
              </label>
              <button
                type="button"
                className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
                disabled={nameBusy || !nameDraft.trim()}
                onClick={() => {
                  void (async () => {
                    setNameBusy(true);
                    setNameStatus(null);
                    try {
                      const supabase = createClient();
                      const trimmed = nameDraft.trim();
                      const { error } = await supabase.auth.updateUser({
                        data: {
                          full_name: trimmed,
                          name: trimmed,
                          display_name: trimmed,
                        },
                      });
                      if (error) throw error;
                      onDisplayNameChange?.(trimmed);
                      setNameStatus("Name saved.");
                    } catch (err) {
                      setNameStatus(
                        err instanceof Error
                          ? err.message
                          : "Could not update name."
                      );
                    } finally {
                      setNameBusy(false);
                    }
                  })();
                }}
              >
                Save name
              </button>
              {nameStatus && (
                <p className="mt-2 text-xs text-muted">{nameStatus}</p>
              )}

              <h4 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Change password
              </h4>
              <label className="settings-row settings-row-stack">
                <span>New password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="settings-text-input"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
              </label>
              <label className="settings-row settings-row-stack">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="settings-text-input"
                  autoComplete="new-password"
                />
              </label>
              <button
                type="button"
                className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
                disabled={passwordBusy || !password}
                onClick={() => {
                  void (async () => {
                    setPasswordBusy(true);
                    setPasswordStatus(null);
                    try {
                      if (password.length < 8) {
                        throw new Error(
                          "Password must be at least 8 characters."
                        );
                      }
                      if (password !== passwordConfirm) {
                        throw new Error("Passwords do not match.");
                      }
                      const supabase = createClient();
                      const { error } = await supabase.auth.updateUser({
                        password,
                      });
                      if (error) throw error;
                      setPassword("");
                      setPasswordConfirm("");
                      setPasswordStatus("Password updated.");
                    } catch (err) {
                      setPasswordStatus(
                        err instanceof Error
                          ? err.message
                          : "Could not update password."
                      );
                    } finally {
                      setPasswordBusy(false);
                    }
                  })();
                }}
              >
                Update password
              </button>
              {passwordStatus && (
                <p className="mt-2 text-xs text-muted">{passwordStatus}</p>
              )}
            </>
          )}
        </section>

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
