"use client";

import { useEffect, useState } from "react";
import { AddToLibraryButton } from "@/components/library/AddToLibraryButton";
import { ClipboardIcon, ExternalLinkIcon } from "@/components/icons";
import type { LinkPreview } from "@/lib/preview/openGraph";

/**
 * Compact OG chrome for the link bubble: fixed thumbnail, clamped summary,
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
  const [imageFailed, setImageFailed] = useState(false);
  const image = preview?.image ?? null;
  const title = preview?.title || url;

  useEffect(() => {
    setImageFailed(false);
  }, [image]);

  const showImage = Boolean(image) && !imageFailed;

  async function copyTitle() {
    try {
      await navigator.clipboard.writeText(title);
    } catch {
      // ignore clipboard failures
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
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="link-preview-thumb-placeholder" />
          )}
        </div>
        <div className="link-preview-meta">
          {loading && <p className="link-hover-meta">Loading preview…</p>}
          {error && <p className="link-hover-error">{error}</p>}
          {preview?.siteName && (
            <p className="link-hover-site">{preview.siteName}</p>
          )}
          <div className="link-preview-title-row">
            <p className="link-hover-title">
              {preview?.title || (!loading ? url : "")}
            </p>
            {title ? (
              <button
                type="button"
                className="link-preview-copy-title"
                title="Copy title"
                aria-label="Copy title"
                onClick={() => void copyTitle()}
              >
                <ClipboardIcon />
              </button>
            ) : null}
          </div>
          {preview?.description ? (
            <p className="link-hover-desc">{preview.description}</p>
          ) : null}
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
