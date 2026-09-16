import { describe, expect, it } from "vitest";
import {
  formatGithubPushOrigin,
  githubPushCommitMessage,
} from "@/lib/github/commitMessage";

describe("githubPushCommitMessage", () => {
  it("keeps sync and the file count, then lists the path and host", () => {
    expect(
      githubPushCommitMessage(
        [{ path: "drafts/new-essay.md" }],
        "https://blogide.com"
      )
    ).toBe(
      "blogide: sync 1 file\n\n- drafts/new-essay.md\n\nvia BlogIDE (https://blogide.com)"
    );
  });

  it("lists several files under sync N files", () => {
    const message = githubPushCommitMessage(
      [
        { path: "README.md" },
        { path: "/drafts/one.md" },
        { path: "posts/two.md" },
      ],
      "https://writing.example"
    );
    expect(message.startsWith("blogide: sync 3 files\n\n")).toBe(true);
    expect(message).toContain("- README.md");
    expect(message).toContain("- drafts/one.md");
    expect(message).toContain("- posts/two.md");
    expect(message.endsWith("via BlogIDE (https://writing.example)")).toBe(
      true
    );
  });

  it("still says via BlogIDE when the host is missing", () => {
    expect(formatGithubPushOrigin("")).toBe("via BlogIDE");
    expect(formatGithubPushOrigin("  https://blogide.com/  ")).toBe(
      "via BlogIDE (https://blogide.com)"
    );
  });
});
