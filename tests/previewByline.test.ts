import { describe, expect, it } from "vitest";
import { formatAuthors, previewByline } from "@/lib/preview/byline";
import type { LinkPreview } from "@/lib/preview/openGraph";

const base: LinkPreview = {
  url: "https://example.com",
  title: "T",
  description: "",
  siteName: "example.com",
  image: null,
};

describe("previewByline", () => {
  it("joins authors and year", () => {
    expect(
      previewByline({
        ...base,
        citation: {
          itemType: "journalArticle",
          title: "T",
          url: base.url,
          creators: [
            { firstName: "Jane", lastName: "Smith" },
            { name: "WHO" },
          ],
          date: "2019-05-01",
        },
      })
    ).toBe("Jane Smith and WHO · 2019");
  });

  it("falls back to the meta author and handles a missing year", () => {
    expect(previewByline({ ...base, author: "Sam Lee" })).toBe("Sam Lee");
  });

  it("shows just the year without authors, and nothing when empty", () => {
    expect(
      previewByline({
        ...base,
        citation: { itemType: "webpage", title: "T", url: base.url, creators: [], date: "2020" },
      })
    ).toBe("2020");
    expect(previewByline(base)).toBe("");
    expect(previewByline(null)).toBe("");
  });

  it("uses et al. for three or more authors", () => {
    expect(
      formatAuthors([{ lastName: "A" }, { lastName: "B" }, { lastName: "C" }])
    ).toBe("A et al.");
  });
});
