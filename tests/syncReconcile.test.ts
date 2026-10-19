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
