"use client";

import { useState } from "react";
import { SettingsInfo } from "@/components/SettingsInfo";
import {
  CITE_STYLE_LABELS,
  DEFAULT_CITE_STYLE,
  citeStyleFromDashPref,
  isCiteStyleId,
  type CiteStyleId,
} from "@/lib/citations/citeStyle";
import {
  clearZoteroConfig,
  loadZoteroConfig,
  maskZoteroKey,
  saveZoteroConfig,
  type ZoteroLibraryType,
} from "@/lib/zotero/token";
import { useEditorPrefs } from "@/components/EditorPrefsContext";

type Draft = {
  apiKey: string;
  userId: string;
  libraryType: ZoteroLibraryType;
  groupId: string;
  style: CiteStyleId;
};

function initialStyle(dashStyle: "chicago" | "mla" | undefined): CiteStyleId {
  if (typeof window !== "undefined") {
    try {
      if (localStorage.getItem("blogide.zotero.style")) {
        return loadZoteroConfig().style;
      }
    } catch {
      /* ignore quota / private mode */
    }
  }
  return citeStyleFromDashPref(dashStyle);
}

export function ZoteroSettingsSection() {
  const { prefs } = useEditorPrefs();
  const [saved, setSaved] = useState(() => loadZoteroConfig());
  const [draft, setDraft] = useState<Draft>(() => {
    const current = loadZoteroConfig();
    return {
      apiKey: "",
      userId: current.userId,
      libraryType: current.libraryType,
      groupId: current.groupId,
      style: initialStyle(prefs.dashStyle),
    };
  });
  const [status, setStatus] = useState<string | null>(null);

  function persist() {
    const next = saveZoteroConfig({
      apiKey: draft.apiKey.trim() || saved.apiKey,
      userId: draft.userId.trim(),
      libraryType: draft.libraryType,
      groupId: draft.groupId.trim(),
      style: draft.style,
    });
    setSaved(next);
    setDraft((prev) => ({ ...prev, apiKey: "" }));
    setStatus("Saved on this device.");
  }

  return (
    <section className="settings-section">
      <h3>
        Zotero
        <SettingsInfo text="Search your Zotero library from the Cite rail and insert Chicago notes as BlogIDE footnotes. Create a key with library read only — BlogIDE never writes items. The key stays in this browser, not in Supabase." />
      </h3>
      <p className="settings-help">
        Off until a key is saved.{" "}
        <a
          href="https://www.zotero.org/settings/keys"
          target="_blank"
          rel="noreferrer"
        >
          Create a key at zotero.org/settings/keys
        </a>{" "}
        with library read only.
      </p>
      <label className="settings-row settings-row-stack">
        <span>Library</span>
        <select
          className="settings-text-input"
          value={draft.libraryType}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              libraryType: event.target.value as ZoteroLibraryType,
            }))
          }
        >
          <option value="user">Personal library</option>
          <option value="group">Group library</option>
        </select>
      </label>
      {draft.libraryType === "group" ? (
        <label className="settings-row settings-row-stack">
          <span>Group ID</span>
          <input
            className="settings-text-input"
            inputMode="numeric"
            autoComplete="off"
            value={draft.groupId}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, groupId: event.target.value }))
            }
            placeholder="1234567"
          />
        </label>
      ) : (
        <label className="settings-row settings-row-stack">
          <span>User ID</span>
          <input
            className="settings-text-input"
            inputMode="numeric"
            autoComplete="off"
            value={draft.userId}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, userId: event.target.value }))
            }
            placeholder="From zotero.org/settings/keys"
          />
        </label>
      )}
      <label className="settings-row settings-row-stack">
        <span>API key</span>
        <input
          type="password"
          autoComplete="off"
          className="settings-text-input"
          placeholder={
            saved.apiKey
              ? `Saved · ${maskZoteroKey(saved.apiKey)}`
              : "Read-only Zotero key"
          }
          value={draft.apiKey}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, apiKey: event.target.value }))
          }
        />
      </label>
      <label className="settings-row settings-row-stack">
        <span>Default citation style</span>
        <select
          className="settings-text-input"
          value={draft.style}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              style: isCiteStyleId(event.target.value)
                ? event.target.value
                : DEFAULT_CITE_STYLE,
            }))
          }
        >
          {(Object.keys(CITE_STYLE_LABELS) as CiteStyleId[]).map((id) => (
            <option key={id} value={id}>
              {CITE_STYLE_LABELS[id]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
          onClick={persist}
        >
          Save Zotero
        </button>
        {saved.apiKey && (
          <button
            type="button"
            className="settings-link-btn"
            onClick={() => {
              clearZoteroConfig();
              setSaved(loadZoteroConfig());
              setDraft({
                apiKey: "",
                userId: "",
                libraryType: "user",
                groupId: "",
                style: citeStyleFromDashPref(prefs.dashStyle),
              });
              setStatus("Removed from this device.");
            }}
          >
            Remove key
          </button>
        )}
      </div>
      {status && <p className="mt-2 text-xs text-muted">{status}</p>}
    </section>
  );
}
