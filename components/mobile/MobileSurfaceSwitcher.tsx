"use client";

import { BookmarkIcon } from "@/components/icons";
import {
  MOBILE_SURFACES,
  MOBILE_SURFACE_LABELS,
  type MobileSurface,
} from "@/lib/mobile/surface";

/**
 * Phone header picker: Editor (the BlogIDE mark) · Notes · AI · Library.
 * Each opens full screen below the header.
 */
export function MobileSurfaceSwitcher({
  value,
  onChange,
  unreadNotes = 0,
}: {
  value: MobileSurface;
  onChange: (surface: MobileSurface) => void;
  unreadNotes?: number;
}) {
  return (
    <nav
      role="tablist"
      aria-label="Screen"
      className="flex items-center gap-0.5 rounded-lg border border-border bg-panel/60 p-0.5"
    >
      {MOBILE_SURFACES.map((surface) => {
        const active = surface === value;
        const label =
          surface === "notes" && unreadNotes > 0
            ? `Notes · ${unreadNotes} unread`
            : MOBILE_SURFACE_LABELS[surface];
        return (
          <button
            key={surface}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={label}
            title={label}
            onClick={() => onChange(surface)}
            className={`relative flex h-8 w-9 items-center justify-center rounded-md transition-colors ${
              active
                ? "bg-accent/15 text-accent shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            <SurfaceIcon surface={surface} />
            {surface === "notes" && unreadNotes > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[0.55rem] font-semibold text-white">
                {unreadNotes > 9 ? "9+" : unreadNotes}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function SurfaceIcon({ surface }: { surface: MobileSurface }) {
  if (surface === "editor") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/icons/blogide.svg"
        alt=""
        width={20}
        height={20}
        className="size-5"
        draggable={false}
      />
    );
  }
  if (surface === "library") return <BookmarkIcon />;
  if (surface === "ai") return <SparkleIcon />;
  return <NotesIcon />;
}

function NotesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H7l-3 2.5V11H3.5a1 1 0 0 1-1-1z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 5.75h5M5.5 8h3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M7 2.2 8.2 5.8 11.8 7 8.2 8.2 7 11.8 5.8 8.2 2.2 7 5.8 5.8z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M12.3 10.3 12.8 11.7 14.2 12.2 12.8 12.7 12.3 14.1 11.8 12.7 10.4 12.2 11.8 11.7z"
        fill="currentColor"
      />
    </svg>
  );
}
