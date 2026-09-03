import { describe, expect, it } from "vitest";
import {
  formatLibraryCitation,
  hitFromLibraryEntry,
} from "@/lib/citations/libraryCite";
import { parseEssayCitationsJson } from "@/lib/markdown/essayCitations";

describe("library citations", () => {
  it("formats a bookmark as a title plus URL", () => {
    expect(
      formatLibraryCitation({
        id: "abc",
        kind: "link",
        name: "Animal Liberation",
        url: "https://example.com/singer",
      })
    ).toBe("“Animal Liberation”, https://example.com/singer.");
  });

  it("uses the URL alone when the title is the URL", () => {
    expect(
      formatLibraryCitation({
        id: "abc",
        kind: "link",
        name: "https://example.com/",
        url: "https://example.com/",
      })
    ).toBe("https://example.com/.");
  });

  it("formats a PDF as its file name", () => {
    expect(
      formatLibraryCitation({
        id: "pdf1",
        kind: "pdf",
        name: "Nussbaum 2011.pdf",
      })
    ).toBe("Nussbaum 2011.pdf");
  });

  it("builds a library hit and accepts library in the essay trailer", () => {
    const hit = hitFromLibraryEntry({
      id: "link-1",
      kind: "link",
      name: "Example",
      url: "https://example.com/a",
    });
    expect(hit.provider).toBe("library");
    expect(hit.id).toBe("library:link-1");
    expect(hit.formatted).toContain("https://example.com/a");
    expect(
      parseEssayCitationsJson(
        JSON.stringify([
          {
            id: hit.id,
            provider: "library",
            citeKey: hit.citeKey,
            title: hit.title,
            formatted: { "chicago-note": hit.formatted },
          },
        ])
      )
    ).toHaveLength(1);
  });
});
