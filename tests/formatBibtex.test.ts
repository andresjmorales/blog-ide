import { describe, expect, it } from "vitest";
import {
  formatBibEntry,
  formatBibtexSource,
  formatForLocalStyle,
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

  it("formats a Chicago footnote and a separate bibliography entry", () => {
    const forms = formatForLocalStyle(parseBibtex(SAMPLE)[0], "chicago-note");
    expect(forms.footnote).toBe(
      'Jane Doe and John Smith, "An Example," *Test Journal* 1, no. 2 (2024): 10–20.'
    );
    expect(forms.bibliography).toContain("Doe, Jane");
    expect(forms.bibliography).not.toBe(forms.footnote);
    expect(forms.inText).toBeUndefined();
  });

  it("formats APA, Harvard, and an in-text parenthetical", () => {
    const entry = parseBibtex(SAMPLE)[0];
    const apa = formatForLocalStyle(entry, "apa");
    expect(apa.footnote).toContain("Doe, J., & Smith, J. (2024).");
    expect(apa.footnote).toContain("*Test Journal, 1*(2)");
    expect(apa.inText).toBe("(Doe & Smith, 2024)");
    const harvard = formatForLocalStyle(entry, "harvard");
    expect(harvard.footnote).toContain("Doe, J. and Smith, J. (2024)");
    expect(harvard.inText).toBe("(Doe and Smith 2024)");
  });

  it("formats a webpage as a Chicago note", () => {
    const [entry] = parseBibtex(`@misc{singer,
      author = {Singer, Peter},
      title = {Animal Liberation},
      howpublished = {The Site},
      date = {2024-03-01},
      year = {2024},
      url = {https://example.com/singer}
    }`);
    expect(formatForLocalStyle(entry, "chicago-note").footnote).toBe(
      'Peter Singer, "Animal Liberation," *The Site*, March 1, 2024, https://example.com/singer.'
    );
  });
});
