import { beforeEach, describe, expect, it } from "vitest";
import {
  addLibraryBibtex,
  addLibraryLink,
  canonicalizeLibraryUrl,
  findLibraryLinkByUrl,
  isLibraryLink,
  listLibraryEntries,
  removeLibraryEntry,
  toggleLibraryLink,
} from "@/lib/library/sessionLibrary";

describe("session Library links", () => {
  beforeEach(() => {
    for (const entry of [...listLibraryEntries()]) {
      removeLibraryEntry(entry.id);
    }
  });

  it("canonicalizes trailing slashes for matching", () => {
    expect(canonicalizeLibraryUrl("https://example.com/")).toBe(
      "https://example.com"
    );
    expect(canonicalizeLibraryUrl("https://example.com/path/")).toBe(
      "https://example.com/path"
    );
  });

  it("toggles bookmark add/remove", () => {
    const url = "https://example.com/essay";
    expect(isLibraryLink(url)).toBe(false);
    const added = toggleLibraryLink({ url, title: "Essay" });
    expect(added.added).toBe(true);
    expect(isLibraryLink(`${url}/`)).toBe(true);
    expect(findLibraryLinkByUrl(url)?.name).toBe("Essay");
    const removed = toggleLibraryLink({ url });
    expect(removed.added).toBe(false);
    expect(isLibraryLink(url)).toBe(false);
  });

  it("dedupes addLibraryLink by canonical URL", () => {
    addLibraryLink({ url: "https://example.com/a", title: "A" });
    addLibraryLink({ url: "https://example.com/a/", title: "A2" });
    const links = listLibraryEntries().filter((e) => e.kind === "link");
    expect(links).toHaveLength(1);
    expect(links[0].name).toBe("A2");
  });

  it("saves BibTeX into the Library and dedupes by cite key", () => {
    addLibraryBibtex({
      citeKey: "doe2024",
      title: "An Example",
      bibtex: `@book{doe2024,
  title = {An Example},
  year = {2024}
}`,
      url: "https://example.com/doe",
    });
    addLibraryBibtex({
      citeKey: "doe2024",
      title: "An Example (revised)",
      bibtex: `@book{doe2024,
  title = {An Example (revised)},
  year = {2024}
}`,
    });
    const rows = listLibraryEntries().filter((e) => e.kind === "bibtex");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.citeKey).toBe("doe2024");
    expect(rows[0]?.name).toBe("An Example (revised)");
    expect(rows[0]?.bibtex).toContain("revised");
  });
});
