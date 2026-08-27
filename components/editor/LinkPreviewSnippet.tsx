"use client";

import { useState } from "react";
import { AddToLibraryButton } from "@/components/library/AddToLibraryButton";
import { ExternalLinkIcon } from "@/components/icons";
import type { LinkPreview } from "@/lib/preview/openGraph";

/**
 * Compact OG chrome for the link bubble: fixed thumbnail, one-line summary,
 * Open (new tab) and Pin and read here.
 *
 * Future: add a Cite button here once a Zotero API integration exists.
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
          <p
            className={
              error && !loading ? "link-hover-error" : "link-hover-title"
            }
          >
            {titleText}
          </p>
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
        {/* Future: add a Cite button here once a Zotero API integration exists. */}
        <AddToLibraryButton url={url} title={title} variant="hover" />
      </div>
    </div>
  );
}
