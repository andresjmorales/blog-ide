"use client";

import { useState } from "react";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { SettingsInfo } from "@/components/SettingsInfo";
import { normalizeSiteUrl } from "@/lib/siteRelative";

/**
 * The writer's main site. Site-relative links and images (`/writing/…`)
 * resolve against it in the editor and become absolute URLs on copy,
 * export, and publish. GitHub push keeps them relative.
 */
export function MainSiteSettingsSection() {
  const { prefs, updatePrefs } = useEditorPrefs();
  const [draft, setDraft] = useState(prefs.siteUrl);
  const [invalid, setInvalid] = useState(false);

  function commit() {
    const next = normalizeSiteUrl(draft);
    if (draft.trim() && !next) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(next);
    if (next !== prefs.siteUrl) updatePrefs({ siteUrl: next });
  }

  return (
    <section className="settings-section">
      <h3>
        Main site
        <SettingsInfo text="Where your essays are published, e.g. example.com. Links and images with site-relative paths like /writing/my-essay/figure.webp load from this site in the editor. When you copy, export, or publish elsewhere (Substack, HTML, Word), they become full URLs on this site. GitHub push keeps them relative, so your site still serves its own copies." />
      </h3>
      <label className="settings-row settings-row-stack">
        <span>Site URL</span>
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="example.com"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          className="settings-text-input"
          aria-invalid={invalid || undefined}
        />
      </label>
      {invalid ? (
        <p className="settings-help text-amber-800 dark:text-amber-300">
          That doesn&apos;t look like a site address. Try something like
          example.com.
        </p>
      ) : (
        <p className="settings-help">
          {prefs.siteUrl
            ? `Paths like /writing/… resolve to ${prefs.siteUrl}.`
            : "Optional. Leave empty to keep site-relative paths as they are."}
        </p>
      )}
    </section>
  );
}
