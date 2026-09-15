import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { VaultCreateDialog } from "@/components/VaultCreateDialog";

const createVault = vi.hoisted(() => vi.fn());

vi.mock("@/lib/vault/session", () => ({
  createVault: (...args: unknown[]) => createVault(...args),
}));

describe("VaultCreateDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    createVault.mockReset();
  });

  function render() {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <VaultCreateDialog open onClose={() => {}} onCreated={() => {}} />
      );
    });
  }

  it("ignores submit until the opening event has finished", async () => {
    vi.useFakeTimers();
    render();
    const form = container.querySelector("form");
    expect(form).toBeTruthy();
    act(() => {
      form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(createVault).not.toHaveBeenCalled();

    act(() => {
      vi.runAllTimers();
    });

    act(() => {
      form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      "Use at least 8 characters."
    );
    expect(createVault).not.toHaveBeenCalled();
  });
});
