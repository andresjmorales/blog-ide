import { describe, expect, it } from "vitest";
import {
  anchorFootnotes,
  describeAnchoredFootnotes,
  releaseFootnotes,
} from "@/lib/markdown/footnoteAnchors";
import { mergeThreeWay, resolveThreeWay } from "@/lib/markdown/merge3";

/** The pull dialog's merge path: anchor all three, merge, release. */
function merge(base: string, local: string, remote: string) {
  const m = mergeThreeWay(
    anchorFootnotes(base),
    anchorFootnotes(local),
    anchorFootnotes(remote)
  );
  return {
    conflicts: m.conflicts,
    keepBlogide: releaseFootnotes(resolveThreeWay(m, {}, "local")),
    takeGithub: releaseFootnotes(resolveThreeWay(m, {}, "remote")),
    both: releaseFootnotes(resolveThreeWay(m, {}, "both")),
    chunks: m.chunks,
  };
}

const BASE = [
  "Intro.",
  "",
  "First point.[^1]",
  "",
  "Second point.[^2]",
  "",
  "[^1]: Note A.",
  "[^2]: Note B.",
].join("\n");

// GitHub adds a footnote at the top, renumbering everything below it.
const REMOTE = [
  "Intro.[^1]",
  "",
  "First point.[^2]",
  "",
  "Second point.[^3]",
  "",
  "[^1]: New note.",
  "[^2]: Note A.",
  "[^3]: Note B.",
].join("\n");

describe("anchor / release", () => {
  it("round-trips BlogIDE's own footnote layout unchanged", () => {
    expect(releaseFootnotes(anchorFootnotes(BASE))).toBe(BASE);
    expect(releaseFootnotes(anchorFootnotes(REMOTE))).toBe(REMOTE);
    const block = "Text.[^1]\n\n[^1]:\n    Para one.\n\n    Para two.\n";
    expect(releaseFootnotes(anchorFootnotes(block))).toBe(block);
  });

  it("leaves essays without footnotes alone", () => {
    expect(anchorFootnotes("Just text.\n")).toBe("Just text.\n");
    expect(releaseFootnotes("Just text.\n")).toBe("Just text.\n");
  });

  it("makes a renumber-only change identical", () => {
    const renumbered = REMOTE.replace("Intro.[^1]", "Intro.")
      .replace("[^1]: New note.\n", "")
      .replace("[^2]", "[^1]")
      .replace("[^3]", "[^2]")
      .replace("[^2]: Note A.", "[^1]: Note A.")
      .replace("[^3]: Note B.", "[^2]: Note B.");
    expect(anchorFootnotes(renumbered)).toBe(anchorFootnotes(BASE));
    const shifted = "A.[^1]\n\nB.[^2]\n\n[^1]: New.\n[^2]: Note B.";
    expect(anchorFootnotes(shifted).split("\n")[2]).toBe(
      anchorFootnotes("B.[^1]\n\n[^1]: Note B.").split("\n")[0]
    );
  });

  it("keeps unreferenced definitions after the numbered ones", () => {
    const text = "A.[^x]\n\n[^old]: Unused.\n[^x]: Used.";
    expect(releaseFootnotes(anchorFootnotes(text))).toBe(
      "A.[^1]\n\n[^1]: Used.\n[^old]: Unused."
    );
  });
});

describe("merging with renumbered footnotes", () => {
  it("keeps each paragraph's own note when BlogIDE's edit is kept", () => {
    const local = BASE.replace("Second point.", "Second point, revised.");
    const result = merge(BASE, local, REMOTE);
    // Only the revised paragraph changed on BlogIDE's side, and only the
    // new footnote on GitHub's: no overlap once numbers are out of the way.
    expect(result.conflicts).toBe(0);
    expect(result.keepBlogide).toBe(
      [
        "Intro.[^1]",
        "",
        "First point.[^2]",
        "",
        "Second point, revised.[^3]",
        "",
        "[^1]: New note.",
        "[^2]: Note A.",
        "[^3]: Note B.",
      ].join("\n")
    );
  });

  it("never pairs a kept paragraph with the other side's numbering", () => {
    const local = BASE.replace("Second point.[^2]", "Second point, mine.[^2]");
    const remote = REMOTE.replace("Second point.[^3]", "Second point, theirs.[^3]");
    const result = merge(BASE, local, remote);
    expect(result.conflicts).toBe(1);
    expect(result.keepBlogide).toContain("Second point, mine.[^3]");
    expect(result.keepBlogide).toContain("[^3]: Note B.");
    expect(result.takeGithub).toContain("Second point, theirs.[^3]");
    // Keep both: each copy gets its own number and its own definition.
    expect(result.both).toContain("Second point, mine.[^3]");
    expect(result.both).toContain("Second point, theirs.[^4]");
    expect(result.both).toContain("[^4]: Note B.");
  });

  it("shows a note edit as a conflict in its paragraph, readably", () => {
    const local = BASE.replace("[^2]: Note B.", "[^2]: Note B, fixed.");
    const remote = BASE.replace("Second point.", "Second point, edited.");
    const result = merge(BASE, local, remote);
    expect(result.conflicts).toBe(1);
    const conflict = result.chunks.find((chunk) => chunk.kind === "conflict");
    expect(conflict && describeAnchoredFootnotes(conflict.local.join("\n"))).toBe(
      "Second point.[^note: Note B, fixed.]"
    );
  });
});
