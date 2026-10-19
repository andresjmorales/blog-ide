import { describe, expect, it } from "vitest";

import { rebaseDraft, reconcileDraft } from "@/lib/sync/reconcile";

const BASE = "# Essay\n\nOne.\n\nTwo.\n";

describe("reconcileDraft", () => {
  it("takes the remote when the draft has no edits of its own", () => {
    expect(reconcileDraft(BASE, BASE, "# Essay\n\nOne!\n\nTwo.\n")).toEqual({
      kind: "take-remote",
    });
  });

  it("treats re-signed image links as no edit", () => {
    const img = (token: string) =>
      `![a](https://x.supabase.co/storage/v1/object/sign/assets/u/a.webp?token=${token})\n`;
    expect(
      reconcileDraft(BASE + img("old"), BASE + img("new"), "# Essay\n\nOne!\n\nTwo.\n" + img("old"))
    ).toEqual({ kind: "take-remote" });
  });

  it("keeps the draft when only the draft changed", () => {
    const local = "# Essay\n\nOne.\n\nTwo!\n";
    expect(reconcileDraft(BASE, local, BASE)).toEqual({
      kind: "merged",
      markdown: local,
    });
  });

  it("merges edits to different paragraphs", () => {
    expect(
      reconcileDraft(BASE, "# Essay\n\nOne.\n\nTwo!\n", "# Essay\n\nOne!\n\nTwo.\n")
    ).toEqual({ kind: "merged", markdown: "# Essay\n\nOne!\n\nTwo!\n" });
  });

  it("reports edits to the same paragraph as a conflict", () => {
    expect(
      reconcileDraft(BASE, "# Essay\n\nOne?\n\nTwo.\n", "# Essay\n\nOne!\n\nTwo.\n")
    ).toEqual({ kind: "conflict" });
  });
});

describe("rebaseDraft", () => {
  it("carries typing over to the newer version", () => {
    expect(
      rebaseDraft(BASE, "# Essay\n\nOne.\n\nTwo, typed.\n", "# Essay\n\nOne!\n\nTwo.\n")
    ).toBe("# Essay\n\nOne!\n\nTwo, typed.\n");
  });

  it("keeps the typing where both changed the same line", () => {
    expect(
      rebaseDraft(BASE, "# Essay\n\nOne, typed.\n\nTwo.\n", "# Essay\n\nOne!\n\nTwo.\n")
    ).toBe("# Essay\n\nOne, typed.\n\nTwo.\n");
  });
});

describe("reconcileDraft with renumbered footnotes", () => {
  const lines = (...l: string[]) => l.join("\n");
  const base = lines(
    "Intro.",
    "",
    "First point.[^1]",
    "",
    "Second point.[^2]",
    "",
    "[^1]: Note A.",
    "[^2]: Note B."
  );

  it("merges a cloud footnote that renumbers the rest with a local edit", () => {
    const cloud = lines(
      "Intro.[^1]",
      "",
      "First point.[^2]",
      "",
      "Second point.[^3]",
      "",
      "[^1]: New note.",
      "[^2]: Note A.",
      "[^3]: Note B."
    );
    const local = base.replace("Second point.", "Second point, revised.");
    expect(reconcileDraft(base, local, cloud)).toEqual({
      kind: "merged",
      markdown: cloud.replace("Second point.", "Second point, revised."),
    });
  });

  it("numbers footnotes both sides added in different paragraphs", () => {
    const local = lines(
      "Intro.",
      "",
      "First point.[^1]",
      "",
      "Second point.[^2] Mine.[^3]",
      "",
      "[^1]: Note A.",
      "[^2]: Note B.",
      "[^3]: Local note."
    );
    const cloud = lines(
      "Intro.[^1]",
      "",
      "First point.[^2]",
      "",
      "Second point.[^3]",
      "",
      "[^1]: Cloud note.",
      "[^2]: Note A.",
      "[^3]: Note B."
    );
    expect(reconcileDraft(base, local, cloud)).toEqual({
      kind: "merged",
      markdown: lines(
        "Intro.[^1]",
        "",
        "First point.[^2]",
        "",
        "Second point.[^3] Mine.[^4]",
        "",
        "[^1]: Cloud note.",
        "[^2]: Note A.",
        "[^3]: Note B.",
        "[^4]: Local note."
      ),
    });
  });

  it("treats a renumber-only difference as no edit", () => {
    const cloud = base.replace("Intro.", "Intro, edited.");
    const local = lines(
      "Intro.",
      "",
      "First point.[^a]",
      "",
      "Second point.[^b]",
      "",
      "[^a]: Note A.",
      "[^b]: Note B."
    );
    expect(reconcileDraft(base, local, cloud)).toEqual({ kind: "take-remote" });
  });
});
