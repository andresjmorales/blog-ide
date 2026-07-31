import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { WorkspaceConnectionDialog } from "@/components/WorkspaceConnectionDialog";

vi.mock("next/link", () => ({
  default: function MockLink({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

describe("WorkspaceConnectionDialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function render(ui: React.ReactNode) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(ui);
    });
  }

  it("renders nothing when closed", () => {
    render(
      <WorkspaceConnectionDialog
        open={false}
        kind="network"
        onRetry={() => {}}
      />
    );
    expect(container.querySelector("[role='alertdialog']")).toBeNull();
  });

  it("shows a blocking network dialog with help and actions", () => {
    const onRetry = vi.fn();
    render(
      <WorkspaceConnectionDialog
        open
        kind="network"
        detail="Failed to fetch"
        onRetry={onRetry}
      />
    );

    const dialog = container.querySelector("[role='alertdialog']");
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(container.textContent).toContain("BlogIDE can’t reach the cloud");
    expect(container.textContent).toContain("phone hotspot");
    expect(container.textContent).not.toContain("\u2014"); // no em dashes
    expect(container.textContent).toContain(
      "Essays already on this device are usually fine"
    );
    expect(
      container.querySelector('a[href="/help/connection"]')
    ).toBeTruthy();
    expect(container.textContent).toContain("Technical details");
    expect(container.textContent).toContain("Failed to fetch");

    const retry = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Try again")
    );
    expect(retry).toBeTruthy();
    act(() => {
      retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("disables retry while retrying", () => {
    render(
      <WorkspaceConnectionDialog
        open
        kind="unknown"
        retrying
        onRetry={() => {}}
      />
    );
    const retry = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Retrying")
    );
    expect(retry).toBeTruthy();
    expect(retry).toHaveProperty("disabled", true);
  });
});
