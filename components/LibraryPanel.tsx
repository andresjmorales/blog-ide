"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { pickPdfFile } from "@/lib/assets/imagePipeline";
import { QuotaExceededError } from "@/lib/assets/upload";
import {
  addLibraryLinkDurable,
  addLibraryPdfDurable,
  hydrateLibraryFromCloud,
  listLibraryEntries,
  getLibraryServerSnapshot,
  removeLibraryEntryDurable,
  resolveLibraryPdfSrc,
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
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    void hydrateLibraryFromCloud();
  }, []);

  async function addPdf() {
    const file = await pickPdfFile();
    if (!file) return;
    setPdfError(null);
    try {
      const entry = await addLibraryPdfDurable(file);
      openPdfPin({
        src: entry.src,
        title: entry.name,
        revokeOnClose: entry.revokeOnClose,
      });
    } catch (err) {
      setPdfError(
        err instanceof QuotaExceededError
          ? "Storage quota exceeded — free space in Account settings."
          : err instanceof Error
            ? err.message
            : "Could not add PDF."
      );
    }
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
      const entry = await addLibraryLinkDurable({ url, title });
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

  async function openEntry(entry: LibraryMeta) {
    if (entry.kind === "link" && entry.url) {
      openLinkPin({ url: entry.url, title: entry.name });
      return;
    }
    const src = await resolveLibraryPdfSrc(entry);
    if (!src) return;
    openPdfPin({ src, title: entry.name, revokeOnClose: false });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3 text-sm">
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Research PDFs and site bookmarks. When signed in, items sync to the
        cloud and count toward your storage quota (same bucket as essay images,
        separate Library inventory).
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
      {pdfError && (
        <p className="mb-2 text-[0.7rem] text-red-600 dark:text-red-400">
          {pdfError}
        </p>
      )}
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
        <p className="text-xs text-muted">Nothing in the Library yet.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {entries.map((entry) => {
            const canOpen =
              entry.kind === "link"
                ? Boolean(entry.url)
                : Boolean(entry.url || entry.assetPath || entry.id);
            return (
              <li
                key={entry.id}
                className="group flex items-center gap-1 rounded hover:bg-panel"
              >
                <button
                  type="button"
                  disabled={!canOpen}
                  title={canOpen ? `Open ${entry.name}` : "Unavailable"}
                  className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-muted hover:text-foreground disabled:opacity-40"
                  onClick={() => void openEntry(entry)}
                >
                  <span className="mr-1.5 text-[0.65rem] uppercase tracking-wide text-muted">
                    {entry.kind === "link" ? "link" : "pdf"}
                  </span>
                  {entry.name}
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded px-1.5 py-1 text-[0.65rem] text-muted opacity-0 hover:text-red-600 group-hover:opacity-100 dark:hover:text-red-400"
                  title="Remove from library"
                  aria-label={`Remove ${entry.name}`}
                  onClick={() => void removeLibraryEntryDurable(entry.id)}
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
