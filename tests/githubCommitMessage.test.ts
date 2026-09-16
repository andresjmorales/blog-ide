import { describe, expect, it } from "vitest";
import {
  formatGithubPushOrigin,
  githubPushCommitMessage,
} from "@/lib/github/commitMessage";

describe("githubPushCommitMessage", () => {
  it("names a single file in the subject and records the BlogIDE host", () => {
    expect(
      githubPushCommitMessage(
        [{ path: "drafts/new-essay.md" }],
        "https://blogide.com"
      )
    ).toBe(
      "blogide: drafts/new-essay.md\n\nvia BlogIDE (https://blogide.com)"
    );
  });

  it("lists several files in the body", () => {
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

  it("puts a long path in the body and uses the filename as the subject", () => {
    const path = `content/${"nested/".repeat(12)}final.md`;
    const message = githubPushCommitMessage([{ path }], "https://blogide.com");
    expect(message.startsWith("blogide: final.md\n\n")).toBe(true);
    expect(message).toContain(path);
    expect(message).toContain("via BlogIDE (https://blogide.com)");
  });

  it("still says via BlogIDE when the host is missing", () => {
    expect(formatGithubPushOrigin("")).toBe("via BlogIDE");
    expect(formatGithubPushOrigin("  https://blogide.com/  ")).toBe(
      "via BlogIDE (https://blogide.com)"
    );
  });
});
