"use client";

import { useSyncExternalStore } from "react";
import { pickPdfFile } from "@/lib/assets/imagePipeline";
import {
  addLibraryPdf,
  listLibraryEntries,
  getLibraryServerSnapshot,
  getLibrarySrc,
  removeLibraryEntry,
  subscribeLibrary,
} from "@/lib/library/sessionLibrary";
import { openPdfPin } from "@/lib/pins/pinStore";

export function LibraryPanel() {
  const entries = useSyncExternalStore(
    subscribeLibrary,
    listLibraryEntries,
    getLibraryServerSnapshot
  );

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

  function openEntry(id: string, name: string) {
    const src = getLibrarySrc(id);
    if (!src) return;
    openPdfPin({ src, title: name, revokeOnClose: false });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3 text-sm">
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Pin local PDFs for research. Filenames keep their extension
        (report.pdf). Files stay in this browser session — reopen from here
        while the tab is open.
      </p>
      <button
        type="button"
        className="mb-3 rounded border border-border px-2.5 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
        onClick={() => void addPdf()}
      >
        Add PDF…
      </button>
      {entries.length === 0 ? (
        <p className="text-xs text-muted">No PDFs pinned this session.</p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {entries.map((entry) => {
            const available = Boolean(getLibrarySrc(entry.id));
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
                      : "File unavailable — add the PDF again"
                  }
                  className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-muted hover:text-foreground disabled:opacity-40"
                  onClick={() => openEntry(entry.id, entry.name)}
                >
                  {entry.name}
                  {!available && (
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
