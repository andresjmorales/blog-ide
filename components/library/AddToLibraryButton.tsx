"use client";

import { useSyncExternalStore } from "react";
import {
  BookmarkCheckIcon,
  BookmarkIcon,
} from "@/components/icons";
import {
  getLibraryServerSnapshot,
  isLibraryLink,
  listLibraryEntries,
  subscribeLibrary,
  toggleLibraryLink,
} from "@/lib/library/sessionLibrary";

type Variant = "hover" | "pin" | "header";

/**
 * Bookmark control for link previews / pins. Saves the URL into the session
 * Library (same store as “Add site link”). Shows a check when already saved;
 * click again to remove.
 */
export function AddToLibraryButton({
  url,
  title,
  variant = "pin",
}: {
  url: string;
  title?: string;
  variant?: Variant;
}) {
  const entries = useSyncExternalStore(
    subscribeLibrary,
    listLibraryEntries,
    getLibraryServerSnapshot
  );
  const saved = isLibraryLink(url);
  // Touch entries so the selector re-runs when Library changes.
  void entries;

  const className =
    variant === "hover"
      ? `link-hover-bookmark${saved ? " is-saved" : ""}`
      : `pinned-surface-btn link-library-bookmark${saved ? " is-saved" : ""}`;

  return (
    <button
      type="button"
      className={className}
      title={saved ? "Remove from Library" : "Add to Library"}
      aria-label={saved ? "Remove from Library" : "Add to Library"}
      aria-pressed={saved}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleLibraryLink({ url, title });
      }}
    >
      <span className="link-library-bookmark-icon" aria-hidden>
        <BookmarkIcon />
        {saved && (
          <span className="link-library-bookmark-check">
            <BookmarkCheckIcon />
          </span>
        )}
      </span>
      {variant !== "header" && (
        <span>{saved ? "Saved" : "Library"}</span>
      )}
    </button>
  );
}
