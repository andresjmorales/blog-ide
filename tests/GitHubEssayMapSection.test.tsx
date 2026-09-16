import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { GitHubEssayMapSection } from "@/components/GitHubEssayMapSection";
import { clearToasts, getToasts } from "@/lib/ui/toast";

describe("GitHubEssayMapSection path validation", () => {
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
    clearToasts();
  });

  function setInputValue(input: HTMLInputElement, value: string) {
    const proto = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    );
    proto?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("keeps folder-path mistakes inline next to the field", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<GitHubEssayMapSection nodeId="doc-1" />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const pathInput = [...host.querySelectorAll("input")].at(-1) as HTMLInputElement;
    expect(pathInput).toBeTruthy();
    act(() => {
      setInputValue(pathInput, "drafts");
    });
    const save = [...host.querySelectorAll("button")].find((button) =>
      /mapping/i.test(button.textContent ?? "")
    ) as HTMLButtonElement;
    act(() => {
      save.click();
    });
    expect(host.textContent).toMatch(/not a folder/i);
    expect(getToasts()).toHaveLength(0);
  });
});
