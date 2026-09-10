import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { ToastHost } from "@/components/ToastHost";
import { clearToasts, showCopiedToast, showSuccessToast } from "@/lib/ui/toast";

describe("ToastHost", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    host?.remove();
    host = null;
    clearToasts();
  });

  it("renders clipboard and Files action toasts", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(<ToastHost />);
    });
    expect(host.querySelector(".blogide-toasts")).toBeNull();

    act(() => {
      showCopiedToast("Copied Bracketed numbers [1]. Paste into the other editor.");
    });
    expect(host.textContent).toContain("Copied Bracketed numbers [1].");

    act(() => {
      showSuccessToast("Moved “clips/” to Trash.", undefined, "workspace-move");
    });
    expect(host.textContent).toContain("Moved “clips/” to Trash.");
    expect(host.querySelector(".blogide-toast.is-success")).toBeTruthy();
  });
});
