import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { GitHubPullDialog } from "@/components/GitHubPullDialog";
import type { GithubPullFile } from "@/lib/github/pull";
import type { GithubPullHistory } from "@/lib/github/syncHistory";

const base = "Intro.\n\nMiddle.\n\nEnd.";

function file(local: string, remote: string, history: Partial<GithubPullHistory>): GithubPullFile {
  return {
    nodeId: "n1",
    label: "essay.md",
    repo: "o/r",
    branch: "main",
    mappedPath: "posts/essay.md",
    pullPath: "posts/essay.md",
    localMarkdown: local,
    remotes: { "posts/essay.md": remote },
    candidates: [],
    identical: false,
    workspaceTwins: [],
    history: {
      base: { markdown: base, source: "recorded", commit: null, syncedAt: "2026-10-01T00:00:00Z" },
      remoteCommits: [
        { sha: "abcdef1234", subject: "Fix typo", author: "me", date: "2026-10-02T00:00:00Z", htmlUrl: "https://github.com/o/r/commit/abcdef1234" },
      ],
      remoteCommitsTruncated: false,
      localEditedAt: "2026-10-03T00:00:00Z",
      localChanged: true,
      remoteChanged: true,
      ...history,
    },
  };
}

describe("GitHubPullDialog", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    host?.remove();
    host = null;
  });

  function render(files: GithubPullFile[], onApply = vi.fn()) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <GitHubPullDialog open files={files} onClose={() => {}} onApply={onApply} />
      );
    });
    return onApply;
  }

  function button(label: RegExp): HTMLButtonElement {
    const found = [...host!.querySelectorAll("button")].find((b) => label.test(b.textContent ?? ""));
    if (!found) throw new Error(`No button ${label}`);
    return found as HTMLButtonElement;
  }

  it("merges BlogIDE and GitHub edits to different paragraphs", () => {
    const local = base.replace("Intro.", "Intro, mine.");
    const remote = base.replace("End.", "End, theirs.");
    const onApply = render([file(local, remote, {})]);
    expect(host!.textContent).toContain("edited in both · merges cleanly");
    expect(host!.textContent).toContain("Fix typo");
    act(() => button(/Merge from GitHub \(1\)/).click());
    expect(onApply).toHaveBeenCalledWith({
      files: [
        expect.objectContaining({
          nodeId: "n1",
          markdown: "Intro, mine.\n\nMiddle.\n\nEnd, theirs.",
          remoteMarkdown: remote,
        }),
      ],
    });
  });

  it("lets the writer pick a side for a passage both edited", () => {
    const local = base.replace("Middle.", "Middle, mine.");
    const remote = base.replace("Middle.", "Middle, theirs.");
    const onApply = render([file(local, remote, {})]);
    expect(host!.textContent).toContain("1 overlap");
    act(() => button(/^Take GitHub$/).click());
    act(() => button(/Merge from GitHub/).click());
    expect(onApply.mock.calls[0][0].files[0].markdown).toBe(remote);
  });

  it("does not preselect a pull that would only undo BlogIDE edits", () => {
    const local = `${base}\n\nNew.`;
    render([
      file(local, base, { remoteCommits: [], remoteChanged: false }),
    ]);
    expect(host!.textContent).toContain("Pulling would only undo your BlogIDE edits");
    expect(button(/Nothing to apply/).disabled).toBe(true);
  });
});
