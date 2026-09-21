"use client";

import { useState } from "react";
import { AddToLibraryButton } from "@/components/library/AddToLibraryButton";
import { ClipboardIcon, ExternalLinkIcon } from "@/components/icons";
import type { LinkPreview } from "@/lib/preview/openGraph";
import { citeLinkedUrl } from "@/lib/citations/libraryCite";
import { showCopiedToast, showErrorToast } from "@/lib/ui/toast";

/**
 * Compact OG chrome for the link bubble: fixed thumbnail, one-line summary,
 * Open (new tab), Pin and read here, save to Library, and cite.
 */
export function LinkPreviewSnippet({
  url,
  preview,
  loading,
  error,
  onPinAndRead,
}: {
  url: string;
  preview: LinkPreview | null;
  loading: boolean;
  error: string | null;
  onPinAndRead: () => void;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const image = preview?.image ?? null;
  const title = preview?.title || url;
  const showImage = Boolean(image) && failedSrc !== image;
  const titleText = loading
    ? "Loading preview…"
    : error
      ? error
      : preview?.title || url;
  const fetchedTitle = preview?.title?.trim() ?? "";
  const canCopyTitle =
    Boolean(fetchedTitle) && fetchedTitle !== url && !loading && !error;

  async function copyTitle() {
    if (!fetchedTitle) return;
    try {
      await navigator.clipboard.writeText(fetchedTitle);
      showCopiedToast("Copied page title.");
    } catch (err) {
      showErrorToast(err, "Could not copy to the clipboard.", "clipboard-copy");
    }
  }

  return (
    <div className="link-preview-snippet">
      <div className="link-preview-body">
        <div className="link-preview-thumb" aria-hidden>
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image!}
              alt=""
              className="link-preview-thumb-img"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => {
                if (image) setFailedSrc(image);
              }}
            />
          ) : (
            <span className="link-preview-thumb-placeholder" />
          )}
        </div>
        <div className="link-preview-meta">
          <p className="link-hover-site">{preview?.siteName || "\u00a0"}</p>
          <div className="link-hover-title-line">
            <p
              className={
                error && !loading ? "link-hover-error" : "link-hover-title"
              }
            >
              {titleText}
            </p>
            {canCopyTitle && (
              <button
                type="button"
                className="link-hover-copy-title"
                aria-label="Copy title"
                title="Copy page title"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void copyTitle();
                }}
              >
                <ClipboardIcon />
              </button>
            )}
          </div>
          <p className="link-hover-desc">
            {preview?.description || "\u00a0"}
          </p>
        </div>
      </div>
      <div className="link-hover-actions">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title="Open in new tab"
          className="link-preview-open"
        >
          Open
          <ExternalLinkIcon className="link-preview-open-icon" />
        </a>
        <button type="button" onClick={onPinAndRead}>
          Pin and read here
        </button>
        <button
          type="button"
          title="Cite this link in the essay"
          onClick={() => void citeLinkedUrl(url, title, preview)}
        >
          Cite
        </button>
        <AddToLibraryButton url={url} title={title} preview={preview} variant="hover" />
      </div>
    </div>
  );
}
