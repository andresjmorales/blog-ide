import { beforeEach, describe, expect, it } from "vitest";
import {
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
});
