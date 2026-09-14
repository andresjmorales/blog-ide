import { describe, expect, it } from "vitest";
import {
  formatLibraryCitation,
  hitFromLibraryEntry,
} from "@/lib/citations/libraryCite";
import {
  hitCanCite,
  hitKindLabel,
  hitsFromBibtex,
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

  it("turns a saved BibTeX row into a citable hit", () => {
    const hit = hitFromLibraryEntry(
      {
        id: "bib-1",
        kind: "bibtex",
        name: "Creating Capabilities",
        citeKey: "nussbaum2011",
        bibtex: `@book{nussbaum2011,
  author = {Nussbaum, Martha C.},
  title = {Creating Capabilities},
  year = {2011},
  url = {https://example.com/nussbaum}
}`,
        url: "https://example.com/nussbaum",
      },
      "chicago-note-bibliography"
    );
    expect(hit.provider).toBe("bibtex");
    expect(hit.libraryId).toBe("bib-1");
    expect(hitKindLabel(hit)).toBe("bibtex");
    expect(hitCanCite(hit)).toBe(true);
    expect(hit.formatted).toContain("Creating Capabilities");
    expect(hit.url).toBe("https://example.com/nussbaum");
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

  it("reads a URL or DOI from pasted BibTeX", () => {
    const withUrl = hitsFromBibtex(
      `@article{a,
  title = {A},
  url = {https://example.com/a}
}`,
      "chicago-note-bibliography"
    );
    expect(withUrl[0]?.url).toBe("https://example.com/a");
    const withDoi = hitsFromBibtex(
      `@article{b,
  title = {B},
  doi = {10.1234/example}
}`,
      "chicago-note-bibliography"
    );
    expect(withDoi[0]?.url).toBe("https://doi.org/10.1234/example");
  });

  it("keeps idle browse to saved items, not essay snapshots", () => {
    const saved = stubHit({ id: "lib-1", title: "Saved", libraryId: "1" });
    const pasted = stubHit({
      id: "bib-1",
      provider: "bibtex",
      itemType: "book",
      title: "Pasted",
      libraryId: "bib-lib",
    });
    const used = stubHit({
      id: "lib-1",
      title: "Saved",
      itemType: "library",
    });
    const browse = listBrowseHits([pasted, saved]);
    expect(browse.map((hit) => hit.id)).toEqual(["bib-1", "lib-1"]);
    expect(browse).toHaveLength(2);
    const found = listSearchHits([], [used], [saved], "saved");
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe("lib-1");
  });
});
