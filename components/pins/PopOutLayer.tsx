"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PopOutDocument } from "@/components/pins/PopOutDocument";
import { LinkPinBody } from "@/components/pins/LinkPinBody";
import { PdfPinViewer } from "@/components/pins/PdfPinViewer";
import { PinnedSurface } from "@/components/pins/PinnedSurface";
import { AddToLibraryButton } from "@/components/library/AddToLibraryButton";
import { PanelSlot } from "@/components/panels/PersistentPanel";
import {
  closePin,
  getPinWindows,
  raisePin,
  subscribePinWindows,
  updatePin,
  type DocumentPin,
  type LinkPin,
  type PdfPin,
  type ShellPin,
  type ToolPanelPin,
} from "@/lib/pins/pinStore";
import type { DockSide, PanelId } from "@/lib/panels/layout";

/** Stable empty snapshot for SSR — a fresh `[]` each call loops React. */
const EMPTY_PIN_WINDOWS: ReturnType<typeof getPinWindows> = [];

const SIDE_LABELS: Record<DockSide, string> = {
  left: "Left",
  right: "Right",
  bottom: "Bottom",
};

const VIEW_PAD = 8;

function PopInMenu({
  onPopIn,
}: {
  onPopIn: (side: DockSide) => void;
}) {
  const [open, setOpen] = useState(false);
  const [flipUp, setFlipUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !rootRef.current) return;
    const menu = menuRef.current.getBoundingClientRect();
    const root = rootRef.current.getBoundingClientRect();
    setFlipUp(root.bottom + menu.height > window.innerHeight - VIEW_PAD);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="pinned-surface-btn"
        title="Dock panel"
        onClick={() => setOpen((v) => !v)}
      >
        Pop in
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={`absolute right-0 z-50 min-w-[7.5rem] rounded-md border border-border bg-background py-1 text-sm shadow-md ${
            flipUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {(["left", "right", "bottom"] as DockSide[]).map((side) => (
            <button
              key={side}
              type="button"
              role="menuitem"
              className="flex w-full px-3 py-1.5 text-left hover:bg-panel"
              onClick={() => {
                setOpen(false);
                onPopIn(side);
              }}
            >
              {SIDE_LABELS[side]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PopOutLayer({
  onOpenInEditor,
  onPopInPanel,
  onFloatClosed,
  registerPanelSlot,
  unregisterPanelSlot,
}: {
  onOpenInEditor: (nodeId: string) => void;
  onPopInPanel?: (panelId: PanelId, side: DockSide) => void;
  /** Pin X — keep layout.floating in sync. */
  onFloatClosed?: (panelId: PanelId) => void;
  registerPanelSlot: (id: PanelId, el: HTMLElement | null) => void;
  unregisterPanelSlot?: (id: PanelId, el: HTMLElement | null) => void;
}) {
  const windows = useSyncExternalStore(
    subscribePinWindows,
    getPinWindows,
    () => EMPTY_PIN_WINDOWS
  );

  if (windows.length === 0) return null;

  return (
    <>
      {windows.map((win) => {
        if (win.kind === "document") {
          return (
            <PopOutDocument
              key={win.id}
              win={win as DocumentPin}
              onOpenInEditor={onOpenInEditor}
            />
          );
        }
        if (win.kind === "link") {
          const pin = win as LinkPin;
          return (
            <PinnedSurface
              key={pin.id}
              title={pin.title}
              left={pin.left}
              top={pin.top}
              width={pin.width}
              height={pin.height}
              zIndex={pin.zIndex}
              onClose={() => closePin(pin.id)}
              onRaise={() => raisePin(pin.id)}
              onMove={(left, top) => updatePin(pin.id, { left, top })}
              onResize={(width, height) =>
                updatePin(pin.id, { width, height })
              }
              headerActions={
                <AddToLibraryButton
                  url={pin.url}
                  title={pin.title}
                  variant="header"
                />
              }
            >
              <LinkPinBody pin={pin} />
            </PinnedSurface>
          );
        }
        if (win.kind === "shell") {
          const pin = win as ShellPin;
          return (
            <PinnedSurface
              key={pin.id}
              title={pin.title}
              left={pin.left}
              top={pin.top}
              width={pin.width}
              height={pin.height}
              zIndex={pin.zIndex}
              onClose={() => {
                closePin(pin.id);
                onFloatClosed?.("shell");
              }}
              onRaise={() => raisePin(pin.id)}
              onMove={(left, top) => updatePin(pin.id, { left, top })}
              onResize={(width, height) =>
                updatePin(pin.id, { width, height })
              }
              headerActions={
                onPopInPanel ? (
                  <PopInMenu
                    onPopIn={(side) => onPopInPanel("shell", side)}
                  />
                ) : null
              }
            >
              <div className="flex h-full min-h-0 flex-col bg-panel">
                <PanelSlot
                  panelId="shell"
                  register={registerPanelSlot}
                  unregister={unregisterPanelSlot}
                  className="flex h-full min-h-0 flex-col"
                />
              </div>
            </PinnedSurface>
          );
        }
        if (win.kind === "toolPanel") {
          const pin = win as ToolPanelPin;
          return (
            <PinnedSurface
              key={pin.id}
              title={pin.title}
              left={pin.left}
              top={pin.top}
              width={pin.width}
              height={pin.height}
              zIndex={pin.zIndex}
              onClose={() => {
                closePin(pin.id);
                onFloatClosed?.(pin.panelId);
              }}
              onRaise={() => raisePin(pin.id)}
              onMove={(left, top) => updatePin(pin.id, { left, top })}
              onResize={(width, height) =>
                updatePin(pin.id, { width, height })
              }
              headerActions={
                onPopInPanel ? (
                  <PopInMenu
                    onPopIn={(side) => onPopInPanel(pin.panelId, side)}
                  />
                ) : null
              }
            >
              <div className="flex h-full min-h-0 flex-col overflow-hidden bg-panel">
                <PanelSlot
                  panelId={pin.panelId}
                  register={registerPanelSlot}
                  unregister={unregisterPanelSlot}
                  className="flex h-full min-h-0 flex-col overflow-hidden"
                />
              </div>
            </PinnedSurface>
          );
        }
        const pin = win as PdfPin;
        return (
          <PinnedSurface
            key={pin.id}
            title={pin.title}
            left={pin.left}
            top={pin.top}
            width={pin.width}
            height={pin.height}
            zIndex={pin.zIndex}
            onClose={() => closePin(pin.id)}
            onRaise={() => raisePin(pin.id)}
            onMove={(left, top) => updatePin(pin.id, { left, top })}
            onResize={(width, height) => updatePin(pin.id, { width, height })}
          >
            <PdfPinViewer src={pin.src} title={pin.title} />
          </PinnedSurface>
        );
      })}
    </>
  );
}
