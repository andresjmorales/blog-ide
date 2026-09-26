"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ExternalLinkIcon } from "@/components/icons";
import { AddToLibraryButton } from "@/components/library/AddToLibraryButton";
import { BiblePinBody } from "@/components/pins/BiblePinBody";
import { LinkPinBody } from "@/components/pins/LinkPinBody";
import { PdfPinViewer } from "@/components/pins/PdfPinViewer";
import {
  closePin,
  getPinWindows,
  subscribePinWindows,
  type PinWindow,
} from "@/lib/pins/pinStore";

const EMPTY: ReturnType<typeof getPinWindows> = [];

/** Pins a phone can show; documents and dock panels have their own surfaces. */
const VIEWABLE = new Set<PinWindow["kind"]>(["link", "pdf", "bible"]);

/** history.state key for the entry pushed while the viewer is open. */
const PIN_HISTORY_KEY = "blogidePinViewer";

function viewablePins(windows: readonly PinWindow[]): PinWindow[] {
  return windows.filter((w) => VIEWABLE.has(w.kind));
}

function historyHasViewer(): boolean {
  return Boolean(
    (window.history.state as Record<string, unknown> | null)?.[PIN_HISTORY_KEY]
  );
}

/**
 * Phone stand-in for floating pop-outs: the newest link / PDF / Bible pin
 * opens full screen. Back (or ‹) returns to whatever screen was underneath.
 */
export function MobilePinViewer() {
  const windows = useSyncExternalStore(
    subscribePinWindows,
    getPinWindows,
    () => EMPTY
  );
  const pins = viewablePins(windows);
  const top = pins.reduce<PinWindow | null>(
    (best, w) => (!best || w.zIndex > best.zIndex ? w : best),
    null
  );
  const open = top != null;

  useEffect(() => {
    if (!open) return;
    if (!historyHasViewer()) {
      window.history.pushState(
        { ...(window.history.state ?? {}), [PIN_HISTORY_KEY]: true },
        ""
      );
    }
    function onPopState(event: PopStateEvent) {
      const state = event.state as Record<string, unknown> | null;
      if (state?.[PIN_HISTORY_KEY]) return;
      for (const w of viewablePins(getPinWindows())) closePin(w.id);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [open]);

  if (!top) return null;

  function close(id: string) {
    const last = pins.length === 1;
    // Unwind our history entry so Back doesn't land on a dead viewer.
    if (last && historyHasViewer()) window.history.back();
    else closePin(id);
  }

  return createPortal(
    <div
      role="dialog"
      aria-label={top.title}
      className="fixed inset-x-0 top-0 z-[60] flex flex-col bg-background"
      style={{ height: "var(--app-height, 100dvh)" }}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-2">
        <button
          type="button"
          onClick={() => close(top.id)}
          aria-label="Close"
          className="rounded px-2 py-1 text-lg leading-none text-muted hover:bg-panel hover:text-foreground"
        >
          ‹
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {top.title}
        </span>
        {pins.length > 1 && (
          <span className="shrink-0 text-xs text-muted" title="Open pages">
            {pins.length}
          </span>
        )}
        {top.kind === "link" && (
          <>
            <AddToLibraryButton url={top.url} title={top.title} variant="header" />
            <a
              href={top.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in browser"
              title="Open in browser"
              className="rounded p-1.5 text-muted hover:bg-panel hover:text-foreground"
            >
              <ExternalLinkIcon />
            </a>
          </>
        )}
      </header>
      <div className="pinned-surface-body min-h-0 flex-1">
        {top.kind === "link" ? (
          <LinkPinBody key={top.id} pin={top} />
        ) : top.kind === "pdf" ? (
          <PdfPinViewer src={top.src} title={top.title} />
        ) : (
          <BiblePinBody />
        )}
      </div>
    </div>,
    document.body
  );
}
