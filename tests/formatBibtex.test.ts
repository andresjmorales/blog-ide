import { describe, expect, it } from "vitest";
import {
  formatBibEntry,
  formatBibtexSource,
  parseBibtex,
} from "@/lib/citations/formatBibtex";

const SAMPLE = `
@article{doe2024,
  author = {Doe, Jane and Smith, John},
  title = {An Example},
  journal = {Test Journal},
  year = {2024},
  volume = {1},
  number = {2},
  pages = {10-20}
}
`;

describe("formatBibtex", () => {
  it("parses a BibTeX article", () => {
    const entries = parseBibtex(SAMPLE);
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe("doe2024");
    expect(entries[0].fields.title).toBe("An Example");
  });

  it("formats Chicago-style article text", () => {
    const entry = parseBibtex(SAMPLE)[0];
    const text = formatBibEntry(entry, "chicago");
    expect(text).toContain("Doe, Jane");
    expect(text).toContain('"An Example."');
    expect(text).toContain("*Test Journal*");
    expect(text).toContain("10–20");
  });

  it("formats MLA-style article text", () => {
    const text = formatBibtexSource(SAMPLE, "mla")[0];
    expect(text).toContain("Doe, Jane");
    expect(text).toContain('"An Example."');
  });
});
