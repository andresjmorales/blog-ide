"use client";

import { useState, useSyncExternalStore } from "react";
import { pickPdfFile } from "@/lib/assets/imagePipeline";
import {
  addLibraryLink,
  addLibraryPdf,
  listLibraryEntries,
  getLibraryServerSnapshot,
  getLibrarySrc,
  removeLibraryEntry,
  subscribeLibrary,
  type LibraryMeta,
} from "@/lib/library/sessionLibrary";
import { fetchLinkPreview } from "@/lib/preview/client";
import { openLinkPin, openPdfPin } from "@/lib/pins/pinStore";

export function LibraryPanel() {
  const entries = useSyncExternalStore(
    subscribeLibrary,
    listLibraryEntries,
    getLibraryServerSnapshot
  );
  const [linkDraft, setLinkDraft] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  async function addPdf() {
    const file = await pickPdfFile();
    if (!file) return;
    const entry = addLibraryPdf(file);
    openPdfPin({
      src: entry.src,
      title: entry.name,
      revokeOnClose: false,
    });
  }

  async function addLink() {
    const raw = linkDraft.trim();
    if (!raw) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      let url = raw;
      if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
      }
      try {
        url = new URL(url).href;
      } catch {
        setLinkError("Enter a valid http(s) URL.");
        return;
      }
      let title = url;
      let description: string | undefined;
      let siteName: string | undefined;
      let image: string | null | undefined;
      try {
        const preview = await fetchLinkPreview(url);
        title = preview.title || url;
        description = preview.description || undefined;
        siteName = preview.siteName || undefined;
        image = preview.image;
      } catch {
        /* preview optional — still bookmark the URL */
      }
      const entry = addLibraryLink({ url, title });
      setLinkDraft("");
      openLinkPin({
        url: entry.url!,
        title: entry.name,
        description,
        siteName,
        image,
      });
    } catch {
      setLinkError("Enter a valid http(s) URL.");
    } finally {
      setLinkBusy(false);
    }
  }

  function openEntry(entry: LibraryMeta) {
    if (entry.kind === "link" && entry.url) {
      openLinkPin({ url: entry.url, title: entry.name });
      return;
    }
    const src = getLibrarySrc(entry.id);
    if (!src) return;
    openPdfPin({ src, title: entry.name, revokeOnClose: false });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3 text-sm">
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Pin local PDFs and site links for research. Files and bookmarks stay
        in this browser session — reopen from here while the tab is open.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-border px-2.5 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
          onClick={() => void addPdf()}
        >
          Add PDF…
        </button>
      </div>
      <form
        className="mb-3 flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void addLink();
        }}
      >
        <label className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
          Add site link
        </label>
        <div className="flex gap-1.5">
          <input
            type="url"
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.target.value)}
            placeholder="https://…"
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={linkBusy || !linkDraft.trim()}
            className="shrink-0 rounded border border-border px-2.5 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
          >
            {linkBusy ? "…" : "Add"}
          </button>
        </div>
        {linkError && (
          <p className="text-[0.7rem] text-red-600 dark:text-red-400">
            {linkError}
          </p>
        )}
      </form>
      {entries.length === 0 ? (
        <p className="text-xs text-muted">Nothing pinned this session.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {entries.map((entry) => {
            const available =
              entry.kind === "link"
                ? Boolean(entry.url)
                : Boolean(getLibrarySrc(entry.id));
            return (
              <li
                key={entry.id}
                className="group flex items-center gap-1 rounded hover:bg-panel"
              >
                <button
                  type="button"
                  disabled={!available}
                  title={
                    available
                      ? `Open ${entry.name}`
                      : entry.kind === "pdf"
                        ? "File unavailable — add the PDF again"
                        : "Link unavailable"
                  }
                  className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-muted hover:text-foreground disabled:opacity-40"
                  onClick={() => openEntry(entry)}
                >
                  <span className="mr-1.5 text-[0.65rem] uppercase tracking-wide text-muted">
                    {entry.kind === "link" ? "link" : "pdf"}
                  </span>
                  {entry.name}
                  {!available && entry.kind === "pdf" && (
                    <span className="ml-1 text-[0.65rem] text-muted">
                      (re-add)
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded px-1.5 py-1 text-[0.65rem] text-muted opacity-0 hover:text-red-600 group-hover:opacity-100 dark:hover:text-red-400"
                  title="Remove from library"
                  aria-label={`Remove ${entry.name}`}
                  onClick={() => removeLibraryEntry(entry.id)}
                >
                  rm
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
