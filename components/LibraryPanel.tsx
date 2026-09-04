"use client";

import { useEffect, useState } from "react";
import { pickPdfFile } from "@/lib/assets/imagePipeline";
import { QuotaExceededError } from "@/lib/assets/upload";
import { CitePanel } from "@/components/CiteRail";
import {
  addLibraryLinkDurable,
  addLibraryPdfDurable,
  hydrateLibraryFromCloud,
} from "@/lib/library/sessionLibrary";
import { fetchLinkPreview } from "@/lib/preview/client";
import { openLinkPin, openPdfPin } from "@/lib/pins/pinStore";
import { showErrorToast } from "@/lib/ui/toast";

export function LibraryPanel() {
  const [linkDraft, setLinkDraft] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    void hydrateLibraryFromCloud();
  }, []);

  async function addPdf() {
    const file = await pickPdfFile();
    if (!file) return;
    try {
      const entry = await addLibraryPdfDurable(file);
      openPdfPin({
        src: entry.src,
        title: entry.name,
        revokeOnClose: entry.revokeOnClose,
      });
    } catch (err) {
      showErrorToast(
        err instanceof QuotaExceededError
          ? "Storage quota exceeded. Free space in Settings."
          : err,
        "Could not add PDF.",
        "library-pdf"
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

  const adders = (
    <section className="library-adders">
        <div className="library-adder-row">
          <button
            type="button"
            className="cite-action"
            onClick={() => void addPdf()}
          >
            Add PDF…
          </button>
        </div>
        <form
          className="library-adder-form"
          onSubmit={(event) => {
            event.preventDefault();
            void addLink();
          }}
        >
          <input
            type="url"
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.target.value)}
            placeholder="Add site link…"
            aria-label="Add site link"
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={linkBusy || !linkDraft.trim()}
            className="cite-action"
          >
            {linkBusy ? "…" : "Add"}
          </button>
        </form>
        {linkError && (
          <p className="text-[0.7rem] text-red-600 dark:text-red-400">
            {linkError}
          </p>
        )}
      </section>
  );

  return (
    <div className="library-panel">
      <CitePanel afterResults={adders} />
    </div>
  );
}
