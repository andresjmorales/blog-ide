import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { GitHubDiffDialog } from "@/components/GitHubDiffDialog";
import type { GithubPullFile } from "@/lib/github/pull";

function file(local: string, remote: string | null): GithubPullFile {
  return {
    nodeId: "n1",
    label: "essay.md",
    repo: "o/r",
    branch: "main",
    mappedPath: "essays/essay.md",
    pullPath: "essays/essay.md",
    localMarkdown: local,
    remotes: { "essays/essay.md": remote },
    candidates: [],
    identical: remote === local,
    workspaceTwins: [],
  };
}

describe("GitHubDiffDialog", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  function render(f: GithubPullFile) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const noop = () => {};
    act(() => {
      root!.render(
        <GitHubDiffDialog
          open
          file={f}
          onClose={noop}
          onRefresh={noop}
          onPush={noop}
          onPull={noop}
        />
      );
    });
    return host;
  }

  it("says up to date when the copies match (ignoring CRLF)", () => {
    const el = render(file("# A\n\nBody\n", "# A\r\n\r\nBody\r\n"));
    expect(el.textContent).toContain("Up to date");
    expect(el.textContent).not.toContain("Push to GitHub");
  });

  it("shows word-level changes and offers push / pull", () => {
    const el = render(file("# A\n\nNew words\n", "# A\n\nOld words\n"));
    expect(el.querySelector(".word-diff ins")?.textContent).toBe("New");
    expect(el.querySelector(".word-diff del")?.textContent).toBe("Old");
    expect(el.textContent).toContain("+1");
    expect(el.textContent).toContain("Push to GitHub");
    expect(el.textContent).toContain("Pull from GitHub");
  });

  it("explains a file that is not on GitHub yet", () => {
    const el = render(file("# A\n", null));
    expect(el.textContent).toContain("Not on GitHub yet");
  });
});
