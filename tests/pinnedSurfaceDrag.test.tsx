import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { PinnedSurface } from "@/components/pins/PinnedSurface";
import { SURFACE_DRAG_THRESHOLD_PX } from "@/lib/pins/surfacePointer";

function dispatchPointer(
  target: EventTarget,
  type: string,
  init: PointerEventInit
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      ...init,
    })
  );
}

describe("PinnedSurface titlebar drag", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    host?.remove();
    host = null;
    document.querySelectorAll(".pinned-surface").forEach((el) => el.remove());
  });

  it("does not move or fire onDragStart until the pointer crosses the threshold", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const onMove = vi.fn();
    const onDragStart = vi.fn();

    act(() => {
      root!.render(
        <PinnedSurface
          title="Footnote 1"
          left={100}
          top={80}
          width={360}
          height={280}
          zIndex={40}
          onClose={() => {}}
          onRaise={() => {}}
          onMove={onMove}
          onResize={() => {}}
          onDragStart={onDragStart}
        >
          <p>body</p>
        </PinnedSurface>
      );
    });

    const titlebar = document.querySelector(
      ".pinned-surface-titlebar"
    ) as HTMLElement | null;
    expect(titlebar).toBeTruthy();

    act(() => {
      dispatchPointer(titlebar!, "pointerdown", { clientX: 120, clientY: 90 });
      dispatchPointer(titlebar!, "pointermove", {
        clientX: 121,
        clientY: 91,
      });
    });
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();

    act(() => {
      dispatchPointer(titlebar!, "pointermove", {
        clientX: 120,
        clientY: 90 + SURFACE_DRAG_THRESHOLD_PX,
      });
    });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalled();
  });

  it("does not start a drag while canBeginDrag returns false", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const onMove = vi.fn();
    const onDragStart = vi.fn();

    act(() => {
      root!.render(
        <PinnedSurface
          title="Footnote 1"
          left={100}
          top={80}
          width={360}
          height={280}
          zIndex={40}
          onClose={() => {}}
          onRaise={() => {}}
          onMove={onMove}
          onResize={() => {}}
          onDragStart={onDragStart}
          canBeginDrag={() => false}
        >
          <p>body</p>
        </PinnedSurface>
      );
    });

    const titlebar = document.querySelector(
      ".pinned-surface-titlebar"
    ) as HTMLElement | null;
    act(() => {
      dispatchPointer(titlebar!, "pointerdown", { clientX: 120, clientY: 90 });
      dispatchPointer(titlebar!, "pointermove", {
        clientX: 120,
        clientY: 90 + SURFACE_DRAG_THRESHOLD_PX + 8,
      });
    });
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("forwards data-footnote-id onto the floating root", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <PinnedSurface
          title="Footnote 2"
          left={40}
          top={40}
          width={360}
          height={280}
          zIndex={40}
          dataAttributes={{ "data-footnote-id": "fn-2" }}
          onClose={() => {}}
          onRaise={() => {}}
          onMove={() => {}}
          onResize={() => {}}
        >
          <p>body</p>
        </PinnedSurface>
      );
    });
    const surface = document.querySelector(".pinned-surface");
    expect(surface?.getAttribute("data-footnote-id")).toBe("fn-2");
  });
});
