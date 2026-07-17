"use client";

import { useSyncExternalStore } from "react";
import { PopOutDocument } from "@/components/pins/PopOutDocument";
import { LinkPinBody } from "@/components/pins/LinkPinBody";
import { PdfPinViewer } from "@/components/pins/PdfPinViewer";
import { PinnedSurface } from "@/components/pins/PinnedSurface";
import {
  closePin,
  getPinWindows,
  raisePin,
  subscribePinWindows,
  updatePin,
  type DocumentPin,
  type LinkPin,
  type PdfPin,
} from "@/lib/pins/pinStore";

export function PopOutLayer({
  onOpenInEditor,
}: {
  onOpenInEditor: (nodeId: string) => void;
}) {
  const windows = useSyncExternalStore(
    subscribePinWindows,
    getPinWindows,
    () => []
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
