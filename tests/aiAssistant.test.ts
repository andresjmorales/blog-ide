import { describe, expect, it } from "vitest";
import katex from "katex";
import {
  applySearchReplacePatches,
  findPatchRange,
  splitReplySegments,
} from "@/lib/ai/apply";
import { essayImageParts, extractImageSources } from "@/lib/ai/images";
import { actionUserPrompt } from "@/lib/ai/actions";
import { reviewDiff, wordDiff } from "@/lib/markdown/wordDiff";
import { KATEX_CSS_URL } from "@/lib/editor/math";

describe("patch matching", () => {
  it("matches exact text first", () => {
    expect(findPatchRange("one two three", "two")).toEqual({ from: 4, to: 7 });
  });

  it("tolerates curly quotes, dashes, and rewrapped whitespace", () => {
    const essay = "It’s a “test” — really.\nNext line.";
    const range = findPatchRange(essay, `It's a "test" -\nreally.`);
    expect(range).not.toBeNull();
    expect(essay.slice(range!.from, range!.to)).toBe("It’s a “test” — really.");
  });

  it("applies loose matches", () => {
    const result = applySearchReplacePatches("He said “hi”.", [
      { search: 'He said "hi".', replace: "He waved." },
    ]);
    expect(result.markdown).toBe("He waved.");
    expect(result.applied).toBe(1);
  });

  it("returns null when absent", () => {
    expect(findPatchRange("abc", "xyz")).toBeNull();
  });
});

describe("reply segments", () => {
  it("splits prose and patch blocks", () => {
    const reply =
      "Cut the hedge.\n<<<SEARCH\nI think maybe\n===\nI think\n>>>REPLACE\nDone.";
    const segments = splitReplySegments(reply);
    expect(segments.map((s) => s.type)).toEqual(["text", "patch", "text"]);
    const patch = segments[1];
    expect(patch.type === "patch" && patch.search).toBe("I think maybe");
    expect(patch.type === "patch" && patch.index).toBe(0);
  });

  it("marks an unterminated block as pending while streaming", () => {
    const segments = splitReplySegments("Reason.\n<<<SEARCH\npartial te");
    expect(segments.map((s) => s.type)).toEqual(["text", "pending-patch"]);
  });
});

describe("word diff", () => {
  it("highlights only changed words", () => {
    const segments = wordDiff("the quick brown fox", "the slow brown fox");
    expect(segments).toEqual([
      { type: "same", text: "the " },
      { type: "remove", text: "quick" },
      { type: "add", text: "slow" },
      { type: "same", text: " brown fox" },
    ]);
  });

  it("groups changed lines into word-level rows with context", () => {
    const rows = reviewDiff("# T\n\nkeep\n\nold words here", "# T\n\nkeep\n\nnew words here");
    const change = rows.find((row) => row.type === "change");
    expect(change && change.type === "change" && change.segments).toContainEqual({
      type: "add",
      text: "new",
    });
    expect(rows.some((row) => row.type === "context" && row.text === "keep")).toBe(true);
  });
});

describe("essay images", () => {
  it("finds markdown and html images in order", () => {
    const md =
      '![a](https://x.test/a.png)\n\n<img src="https://x.test/b.jpg">\n\n![c](assets/c.webp "T")';
    expect(extractImageSources(md)).toEqual([
      "https://x.test/a.png",
      "https://x.test/b.jpg",
      "assets/c.webp",
    ]);
  });

  it("sends https by url, inlines data uris, skips relative paths", () => {
    const md =
      "![a](https://x.test/a.png)\n![b](data:image/png;base64,AAAA)\n![c](assets/c.webp)";
    const { parts, skipped } = essayImageParts(md);
    expect(parts).toEqual([
      { type: "image", source: "url", url: "https://x.test/a.png" },
      { type: "image", source: "base64", mediaType: "image/png", data: "AAAA" },
    ]);
    expect(skipped).toBe(1);
  });
});

describe("essay-scope actions", () => {
  it("asks for patch blocks instead of a full rewrite", () => {
    expect(actionUserPrompt("tighten", "essay")).toContain("SEARCH/REPLACE");
    expect(actionUserPrompt("expand", "essay")).toContain("SEARCH/REPLACE");
  });
});

describe("publication preview KaTeX CSS", () => {
  it("loads the stylesheet for the bundled KaTeX version", () => {
    expect(KATEX_CSS_URL).toContain(`katex@${katex.version}/`);
  });
});

describe("selection stats", () => {
  it("counts only the selected range", async () => {
    const { getSchema } = await import("@tiptap/core");
    const { Node } = await import("@tiptap/pm/model");
    const { createExtensions } = await import("@/lib/editor/extensions");
    const { parseBody } = await import("@/lib/markdown/pipeline");
    const { collectRangeStats } = await import("@/lib/editor/documentStats");
    const doc = Node.fromJSON(
      getSchema(createExtensions()),
      parseBody("One two three four.\n\nFive six seven.\n")
    );
    // Inside the first paragraph: "two three".
    const stats = collectRangeStats(doc, 5, 14);
    expect(stats.words).toBe(2);
    expect(collectRangeStats(doc, 0, doc.content.size).words).toBe(7);
  });
});
