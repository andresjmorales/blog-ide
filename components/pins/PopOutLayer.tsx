"use client";

import { useSyncExternalStore } from "react";
import { PopOutDocument } from "@/components/pins/PopOutDocument";
import { LinkPinBody } from "@/components/pins/LinkPinBody";
import { PdfPinViewer } from "@/components/pins/PdfPinViewer";
import { PinnedSurface } from "@/components/pins/PinnedSurface";
import { ShellChat } from "@/components/shell/ShellChat";
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
} from "@/lib/pins/pinStore";
import type { WorkspaceNode } from "@/lib/workspace/types";

/** Stable empty snapshot for SSR — a fresh `[]` each call loops React. */
const EMPTY_PIN_WINDOWS: ReturnType<typeof getPinWindows> = [];

export function PopOutLayer({
  onOpenInEditor,
  nodes = [],
  shellRefreshKey,
  onShellNotesChanged,
  onShellPopIn,
}: {
  onOpenInEditor: (nodeId: string) => void;
  nodes?: WorkspaceNode[];
  shellRefreshKey?: number | string;
  onShellNotesChanged?: () => void;
  onShellPopIn?: () => void;
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
              width={Math.min(pin.width, 380)}
              height={pin.height}
              zIndex={pin.zIndex}
              onClose={() => closePin(pin.id)}
              onRaise={() => raisePin(pin.id)}
              onMove={(left, top) => updatePin(pin.id, { left, top })}
              onResize={(width, height) =>
                updatePin(pin.id, {
                  width: Math.min(width, 380),
                  height,
                })
              }
              headerActions={
                onShellPopIn ? (
                  <button
                    type="button"
                    className="pinned-surface-btn"
                    title="Dock Shell under the editor"
                    onClick={onShellPopIn}
                  >
                    Pop in
                  </button>
                ) : null
              }
            >
              <div className="flex h-full min-h-0 flex-col bg-panel">
                <ShellChat
                  nodes={nodes}
                  refreshKey={shellRefreshKey}
                  onNotesChanged={onShellNotesChanged}
                  compactMeta
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
