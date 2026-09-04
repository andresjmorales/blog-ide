import { describe, expect, it, vi } from "vitest";
import { hitFromLibraryEntry } from "@/lib/citations/libraryCite";
import {
  libraryHitIsPdf,
  resolveLibraryOpenTarget,
} from "@/lib/library/openLibraryItem";
import type { LibraryMeta } from "@/lib/library/sessionLibrary";

describe("open library item", () => {
  it("treats a cloud PDF with a public URL as a PDF pin, not a link", async () => {
    const entry: LibraryMeta = {
      id: "pdf-1",
      kind: "pdf",
      name: "Scan.pdf",
      url: "https://cdn.example/library/scan.pdf",
    };
    const hit = hitFromLibraryEntry(entry);
    expect(libraryHitIsPdf(hit, entry)).toBe(true);
    expect(hit.url).toBe(entry.url);

    const resolvePdfSrc = vi.fn(async (item: LibraryMeta) => item.url ?? null);
    const target = await resolveLibraryOpenTarget([entry], hit, resolvePdfSrc);
    expect(target).toEqual({
      kind: "pdf",
      src: "https://cdn.example/library/scan.pdf",
      title: "Scan.pdf",
    });
    expect(resolvePdfSrc).toHaveBeenCalledWith(entry);
  });

  it("still opens bookmarks in the link reader", async () => {
    const entry: LibraryMeta = {
      id: "link-1",
      kind: "link",
      name: "Essay",
      url: "https://example.com/a",
    };
    const hit = hitFromLibraryEntry(entry);
    const target = await resolveLibraryOpenTarget([entry], hit, async () => null);
    expect(target).toEqual({
      kind: "link",
      url: "https://example.com/a",
      title: "Essay",
    });
  });
});
