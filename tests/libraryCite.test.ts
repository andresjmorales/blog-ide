import { describe, expect, it } from "vitest";
import {
  formatLibraryCitation,
  hitFromLibraryEntry,
} from "@/lib/citations/libraryCite";
import {
  hitCanCite,
  hitKindLabel,
  listBrowseHits,
  listSearchHits,
  type CiteHit,
} from "@/lib/citations/localHits";
import { parseEssayCitationsJson } from "@/lib/markdown/essayCitations";

function stubHit(partial: Partial<CiteHit> & Pick<CiteHit, "id" | "title">): CiteHit {
  return {
    provider: "library",
    citeKey: partial.id,
    creators: "",
    year: "",
    itemType: "link",
    formatted: partial.title,
    bibtex: "",
    ...partial,
  };
}

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
    expect(hit.libraryId).toBe("link-1");
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

  it("labels kinds and withholds cite actions from PDFs", () => {
    expect(
      hitKindLabel(
        hitFromLibraryEntry({
          id: "p1",
          kind: "pdf",
          name: "Scan.pdf",
        })
      )
    ).toBe("pdf");
    expect(
      hitCanCite(
        hitFromLibraryEntry({
          id: "p1",
          kind: "pdf",
          name: "Scan.pdf",
        })
      )
    ).toBe(false);
    expect(
      hitKindLabel(
        hitFromLibraryEntry({
          id: "l1",
          kind: "link",
          name: "Essay",
          url: "https://example.com",
        })
      )
    ).toBe("link");
  });

  it("keeps idle browse to saved items and pasted BibTeX, not essay snapshots", () => {
    const saved = stubHit({ id: "lib-1", title: "Saved", libraryId: "1" });
    const pasted = stubHit({
      id: "bib-1",
      provider: "bibtex",
      itemType: "book",
      title: "Pasted",
    });
    const used = stubHit({
      id: "lib-1",
      title: "Saved",
      itemType: "library",
    });
    const browse = listBrowseHits([pasted], [saved]);
    expect(browse.map((hit) => hit.id)).toEqual(["bib-1", "lib-1"]);
    expect(browse).toHaveLength(2);
    const found = listSearchHits([], [pasted], [used], [saved], "saved");
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe("lib-1");
  });
});
