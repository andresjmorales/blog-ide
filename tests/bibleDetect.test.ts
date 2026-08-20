import { describe, expect, it } from "vitest";
import { detectEnglishBibleRefs, bibleSearchQuery } from "@/lib/bible/detect";

describe("detectEnglishBibleRefs", () => {
  it("finds common English reference forms", () => {
    const hits = detectEnglishBibleRefs(
      "See John 3:16 and Romans 8:28, plus Matt. 10:8."
    );
    expect(hits.map((hit) => hit.text)).toEqual([
      "John 3:16",
      "Romans 8:28",
      "Matt. 10:8",
    ]);
    expect(hits.map((hit) => hit.ref.to_serialized())).toEqual([
      "jhn3:16",
      "rom8:28",
      "mat10:8",
    ]);
    expect(bibleSearchQuery(hits[0]!)).toBe("jhn3:16");
  });

  it("detects Jn abbreviations and ranges", () => {
    expect(detectEnglishBibleRefs("Jn 3:16")[0]?.ref.to_serialized()).toBe(
      "jhn3:16"
    );
    expect(
      detectEnglishBibleRefs("Matthew 10:7-8")[0]?.ref.to_serialized()
    ).toBe("mat10:7-8");
  });

  it("does not treat book names without chapters as references", () => {
    expect(detectEnglishBibleRefs("Luke is my friend.")).toEqual([]);
    expect(detectEnglishBibleRefs("Job was a man.")).toEqual([]);
  });

  it("maps extra verse numbers in a comma list", () => {
    const hits = detectEnglishBibleRefs("Matt 10:6,8");
    expect(hits.map((hit) => hit.text)).toEqual(["Matt 10:6", "8"]);
    expect(hits.map((hit) => hit.ref.to_serialized())).toEqual([
      "mat10:6",
      "mat10:8",
    ]);
  });
});
