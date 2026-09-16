import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { GitHubMapDialog } from "@/components/GitHubMapDialog";

describe("GitHubMapDialog", () => {
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
  });

  function render(onSave = vi.fn()) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <GitHubMapDialog
          open
          onClose={() => {}}
          nodes={[
            { id: "folder-1", label: "drafts", kind: "folder" },
            { id: "doc-1", label: "essay.md", kind: "document" },
          ]}
          defaultRepo="me/site"
          defaultBranch="main"
          onSave={onSave}
        />
      );
    });
    return onSave;
  }

  function setSelectValue(select: HTMLSelectElement, value: string) {
    const proto = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value"
    );
    proto?.set?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setInputValue(input: HTMLInputElement, value: string) {
    const proto = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    );
    proto?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setSelectAndPath(nodeId: string, path: string) {
    const select = host!.querySelector("select")!;
    act(() => {
      setSelectValue(select, nodeId);
    });
    const pathInput = [
      ...host!.querySelectorAll<HTMLInputElement>("input"),
    ].at(-1)!;
    act(() => {
      setInputValue(pathInput, path);
    });
  }

  function saveButton() {
    return [...host!.querySelectorAll("button")].find(
      (button) => button.textContent === "Save mapping"
    )!;
  }

  it("refuses mapping an essay to a folder name", () => {
    const onSave = render();
    setSelectAndPath("doc-1", "drafts");
    act(() => {
      saveButton().click();
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(host!.textContent).toMatch(/\.md file/i);
  });

  it("saves a new essay .md path that does not exist yet", () => {
    const onSave = render();
    setSelectAndPath("doc-1", "drafts/new-essay.md");
    act(() => {
      saveButton().click();
    });
    expect(onSave).toHaveBeenCalledWith({
      nodeId: "doc-1",
      repo: "",
      branch: "",
      path: "drafts/new-essay.md",
    });
  });

  it("still allows a folder prefix without .md", () => {
    const onSave = render();
    setSelectAndPath("folder-1", "drafts");
    act(() => {
      saveButton().click();
    });
    expect(onSave).toHaveBeenCalledWith({
      nodeId: "folder-1",
      repo: "",
      branch: "",
      path: "drafts",
    });
  });
});
