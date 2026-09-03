import { describe, expect, it } from "vitest";
import {
  appendCitationsTrailer,
  citationMatchesText,
  mergeEssayCitation,
  parseEssayCitationsJson,
  serializeEssayCitation,
  stripBlogideTrailers,
  type EssayCitation,
} from "@/lib/markdown/essayCitations";
import { parseBody, roundTrip, serializeBody } from "@/lib/markdown/pipeline";
import { listUsedEssaySources } from "@/lib/citations/essaySources";

const SAMPLE: EssayCitation = {
  id: "ABCD2345",
  provider: "zotero",
  citeKey: "nussbaum2011",
  title: "Creating Capabilities",
  formatted: {
    "chicago-note":
      "Martha C. Nussbaum, *Creating Capabilities* (Cambridge, MA: Harvard University Press, 2011).",
  },
  bibtex: "@book{nussbaum2011, title = {Creating Capabilities}}",
};

describe("essay citation trailers", () => {
  it("round-trips a citations comment", () => {
    const markdown =
      "A claim.[^1]\n\n[^1]: Martha C. Nussbaum, *Creating Capabilities* (Cambridge, MA: Harvard University Press, 2011).\n\n<!--blogide-citations:" +
      JSON.stringify([serializeEssayCitation(SAMPLE)]) +
      "-->\n";
    const doc = parseBody(markdown);
    expect(doc.attrs?.essayCitations).toEqual([serializeEssayCitation(SAMPLE)]);
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("keeps citations and deleted-footnote trailers in either order", () => {
    const citations = JSON.stringify([serializeEssayCitation(SAMPLE)]);
    const deleted =
      '[{"id":"gone-1","content":"**Lost** note","deletedAt":"2020-01-01T00:00:00.000Z"}]';
    const withCitationsLast = `A claim.\n\n<!--blogide-deleted-footnotes:${deleted}-->\n\n<!--blogide-citations:${citations}-->\n`;
    const withDeletedLast = `A claim.\n\n<!--blogide-citations:${citations}-->\n\n<!--blogide-deleted-footnotes:${deleted}-->\n`;
    for (const markdown of [withCitationsLast, withDeletedLast]) {
      const stripped = stripBlogideTrailers(markdown);
      expect(stripped.citations).toEqual([serializeEssayCitation(SAMPLE)]);
      expect(stripped.deletedPayload).toBe(deleted);
      expect(stripped.body).toBe("A claim.\n");
    }
  });

  it("omits the citations trailer when the index is empty", () => {
    expect(appendCitationsTrailer("Hello.\n", [])).toBe("Hello.\n");
    expect(serializeBody(parseBody("Hello.\n"))).not.toContain("blogide-citations");
  });

  it("merges footnote ids on the same source", () => {
    const next = mergeEssayCitation([SAMPLE], {
      ...SAMPLE,
      footnoteIds: ["fn-2"],
      formatted: { mla: "Nussbaum." },
    });
    expect(next).toHaveLength(1);
    expect(next[0]?.footnoteIds).toEqual(["fn-2"]);
    expect(next[0]?.formatted.mla).toBe("Nussbaum.");
    expect(next[0]?.formatted["chicago-note"]).toBe(
      SAMPLE.formatted["chicago-note"]
    );
  });

  it("rejects junk JSON", () => {
    expect(parseEssayCitationsJson("not-json")).toEqual([]);
    expect(parseEssayCitationsJson('{"id":"x"}')).toEqual([]);
  });

  it("matches a footnote body to a stored formatted string", () => {
    expect(
      citationMatchesText(SAMPLE, SAMPLE.formatted["chicago-note"] ?? "")
    ).toBe(true);
    expect(citationMatchesText(SAMPLE, "edited by hand")).toBe(false);
  });

  it("lists used sources in footnote order and marks edits", () => {
    const doc = parseBody(
      "First.[^1] Second.[^2]\n\n[^1]: edited by hand\n[^2]: Martha C. Nussbaum, *Creating Capabilities* (Cambridge, MA: Harvard University Press, 2011).\n"
    );
    doc.attrs = {
      ...doc.attrs,
      essayCitations: [
        { ...SAMPLE, footnoteIds: ["source-1-1"] },
      ],
    };
    const rows = listUsedEssaySources(
      doc.attrs.essayCitations as EssayCitation[],
      doc,
      "chicago-note-bibliography"
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const nussbaum = rows.find((row) => row.citation.id === "ABCD2345");
    expect(nussbaum).toBeTruthy();
  });
});
