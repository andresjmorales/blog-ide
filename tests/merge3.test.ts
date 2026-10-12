import { describe, expect, it } from "vitest";
import { mergeThreeWay, resolveThreeWay } from "@/lib/markdown/merge3";

const base = ["# Title", "", "First paragraph.", "", "Second paragraph.", "", "Third paragraph."].join("\n");

describe("mergeThreeWay", () => {
  it("keeps edits to different paragraphs from both sides", () => {
    const local = base.replace("First paragraph.", "First paragraph, revised in BlogIDE.");
    const remote = base.replace("Third paragraph.", "Third paragraph, fixed on GitHub.");
    const merge = mergeThreeWay(base, local, remote);
    expect(merge.conflicts).toBe(0);
    expect(resolveThreeWay(merge)).toBe(
      base
        .replace("First paragraph.", "First paragraph, revised in BlogIDE.")
        .replace("Third paragraph.", "Third paragraph, fixed on GitHub.")
    );
  });

  it("takes one side's insertions and deletions", () => {
    const local = `${base}\n\nA new closing paragraph.`;
    const remote = base.replace("\n\nSecond paragraph.", "");
    const merged = resolveThreeWay(mergeThreeWay(base, local, remote));
    expect(merged).toBe(
      `${base.replace("\n\nSecond paragraph.", "")}\n\nA new closing paragraph.`
    );
  });

  it("does not conflict when both sides made the same edit", () => {
    const edited = base.replace("Second paragraph.", "Same fix.");
    const merge = mergeThreeWay(base, edited, edited);
    expect(merge.conflicts).toBe(0);
    expect(resolveThreeWay(merge)).toBe(edited);
  });

  it("reports a conflict when both sides edit the same paragraph", () => {
    const local = base.replace("Second paragraph.", "Second, BlogIDE wording.");
    const remote = base.replace("Second paragraph.", "Second, GitHub wording.");
    const merge = mergeThreeWay(base, local, remote);
    expect(merge.conflicts).toBe(1);
    const conflict = merge.chunks.find((chunk) => chunk.kind === "conflict");
    expect(conflict).toEqual({
      kind: "conflict",
      base: ["Second paragraph."],
      local: ["Second, BlogIDE wording."],
      remote: ["Second, GitHub wording."],
    });
    expect(resolveThreeWay(merge)).toBe(local);
    expect(resolveThreeWay(merge, { 0: "remote" })).toBe(remote);
    expect(resolveThreeWay(merge, { 0: "both" })).toBe(
      base.replace("Second paragraph.", "Second, BlogIDE wording.\nSecond, GitHub wording.")
    );
  });

  it("treats different text appended at the same spot as a conflict", () => {
    const merge = mergeThreeWay(base, `${base}\nMine.`, `${base}\nTheirs.`);
    expect(merge.conflicts).toBe(1);
    expect(resolveThreeWay(merge, { 0: "both" })).toBe(`${base}\nMine.\nTheirs.`);
  });

  it("returns the other side unchanged when one side did nothing", () => {
    const remote = "Completely\nrewritten.";
    expect(resolveThreeWay(mergeThreeWay(base, base, remote))).toBe(remote);
    expect(resolveThreeWay(mergeThreeWay(base, remote, base))).toBe(remote);
  });
});
