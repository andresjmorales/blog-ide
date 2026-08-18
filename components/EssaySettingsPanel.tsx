"use client";

import { useEffect, useState } from "react";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { GitHubEssayMapSection } from "@/components/GitHubEssayMapSection";
import type { GithubMapStatus } from "@/lib/github/types";
import {
  HARPER_LANGUAGE_OPTIONS,
  isHarperSupportedLang,
} from "@/lib/editor/harper/dialect";
import {
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
  initialTab?: EssayTab;
  nodeId?: string | null;
  documentName?: string | null;
  previewMode?: boolean;
  githubStatus?: GithubMapStatus;
  githubSettingsEpoch?: number;
  onGithubSettingsChanged?: () => void;
};

export type EssayTab = "title" | "writing" | "github";

const TABS: { id: EssayTab; label: string }[] = [
  { id: "title", label: "Title" },
  { id: "writing", label: "Writing check" },
  { id: "github", label: "GitHub" },
];

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
  initialTab = "title",
  nodeId = null,
  documentName = null,
  previewMode = false,
  githubStatus,
  githubSettingsEpoch = 0,
  onGithubSettingsChanged,
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
      key={`${title}:${initialTab}`}
      title={title}
      onClose={onClose}
      onTitleChange={onTitleChange}
      documentLanguages={documentLanguages}
      onDocumentLanguagesChange={onDocumentLanguagesChange}
      spellcheckOverride={spellcheckOverride}
      onSpellcheckOverrideChange={onSpellcheckOverrideChange}
      canEditTitle={canEditTitle}
      initialTab={initialTab}
      nodeId={nodeId}
      documentName={documentName}
      previewMode={previewMode}
      githubStatus={githubStatus}
      githubSettingsEpoch={githubSettingsEpoch}
      onGithubSettingsChanged={onGithubSettingsChanged}
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
  initialTab,
  nodeId,
  documentName,
  previewMode,
  githubStatus,
  githubSettingsEpoch,
  onGithubSettingsChanged,
}: {
  title: string;
  onClose: () => void;
  onTitleChange: (title: string) => void;
  documentLanguages: string[];
  onDocumentLanguagesChange: (languages: string[]) => void;
  spellcheckOverride: SpellcheckOverride;
  onSpellcheckOverrideChange: (override: SpellcheckOverride) => void;
  canEditTitle: boolean;
  initialTab: EssayTab;
  nodeId: string | null;
  documentName: string | null;
  previewMode: boolean;
  githubStatus?: GithubMapStatus;
  githubSettingsEpoch: number;
  onGithubSettingsChanged?: () => void;
}) {
  const { prefs } = useEditorPrefs();
  const [draftTitle, setDraftTitle] = useState(title);
  const [tab, setTab] = useState<EssayTab>(initialTab);
  const visibleTabs = nodeId
    ? TABS
    : TABS.filter((item) => item.id !== "github");

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
        className="settings-panel is-anchored"
      >
        <div className="settings-panel-header">
          <h2 id="essay-settings-title">Essay settings</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>

        <div
          className="settings-panel-tabs"
          role="tablist"
          aria-label="Essay settings"
        >
          {visibleTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={
                tab === item.id
                  ? "settings-panel-tab is-active"
                  : "settings-panel-tab"
              }
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="settings-panel-body" role="tabpanel">
          {tab === "title" && (
            <section className="settings-section">
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
            </section>
          )}

          {tab === "writing" && (
            <section className="settings-section">
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
                    Inherit default (
                    {prefs.spellcheckEnabled ? "on" : "off"})
                  </option>
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>

              {!effectiveEnabled ? (
                <p className="settings-help">
                  Writing check is off for this essay
                  {spellcheckOverride === null && !prefs.spellcheckEnabled
                    ? " (Preferences default). Turn it on here or under Preferences."
                    : "."}
                </p>
              ) : (
                <>
                  <p className="settings-help">
                    English dialect for Harper (on-device spelling + grammar).
                    Selecting a dialect makes it primary.
                    {inheritingLangs
                      ? " Showing Preferences defaults until you change them."
                      : ""}
                  </p>
                  <div className="spellcheck-langs is-detailed">
                    {HARPER_LANGUAGE_OPTIONS.map((option) => {
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
                  {!isHarperSupportedLang(primary) && (
                    <p className="settings-help">
                      Harper is English-only for now, so writing check stays
                      idle until an English dialect is primary. A
                      dictionary-based checker for other languages may come
                      later.
                    </p>
                  )}
                  <p className="settings-help">
                    Red underlines are spelling/typos; blue are grammar and
                    style. Click an underline for suggestions. Runs locally in
                    your browser (WASM).
                  </p>
                </>
              )}
            </section>
          )}

          {tab === "github" && nodeId && (
            <section className="settings-section">
              <GitHubEssayMapSection
                nodeId={nodeId}
                documentName={documentName}
                previewMode={previewMode}
                status={githubStatus}
                settingsEpoch={githubSettingsEpoch}
                onSettingsChanged={onGithubSettingsChanged}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
