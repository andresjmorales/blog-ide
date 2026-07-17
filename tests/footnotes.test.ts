import { describe, expect, it } from "vitest";
import {
  isLossy,
  parseBody,
  roundTrip,
  serializeBody,
} from "@/lib/markdown/pipeline";

function footnotesIn(doc: ReturnType<typeof parseBody>) {
  const found: Array<{ id: string; content: string }> = [];
  function visit(node: typeof doc) {
    if (node.type === "footnoteRef") {
      found.push({
        id: String(node.attrs?.id),
        content: String(node.attrs?.content),
      });
    }
    node.content?.forEach(visit);
  }
  visit(doc);
  return found;
}

describe("footnote markdown pipeline", () => {
  it("folds definition markdown into inline reference attrs", () => {
    const doc = parseBody(
      "A claim.[^source]\n\n[^source]: **Bold**, *italic*, and `code`.\n"
    );

    expect(footnotesIn(doc)).toEqual([
      {
        id: "source-source-1",
        content: "**Bold**, *italic*, and `code`.",
      },
    ]);
  });

  it("renumbers by document order after paragraphs move", () => {
    const doc = parseBody(
      "First.[^a]\n\nSecond.[^b]\n\n[^a]: Alpha.\n[^b]: Beta.\n"
    );
    expect(doc.content).toHaveLength(2);
    doc.content = [doc.content![1], doc.content![0]];

    expect(serializeBody(doc)).toBe(
      "Second.[^1]\n\nFirst.[^2]\n\n[^1]: Beta.\n[^2]: Alpha."
    );
  });

  it("preserves orphan definitions at the end unchanged", () => {
    const orphan = "[^unused]:   Keep this spacing.";
    const doc = parseBody(`A paragraph.\n\n${orphan}\n`);
    expect(serializeBody(doc)).toBe(`A paragraph.\n\n${orphan}`);
  });

  it("treats a canonical footnote document as lossless", () => {
    const markdown =
      "A claim.[^1]\n\n[^1]: A [linked](https://example.com) note.\n";
    expect(isLossy(markdown)).toBe(false);
  });

  it("round-trips the BlogIDE deleted-footnotes trailer", () => {
    const markdown =
      "A claim.[^1]\n\n[^1]: Keep me.\n\n<!--blogide-deleted-footnotes:[{\"id\":\"gone-1\",\"content\":\"**Lost** note\",\"deletedAt\":\"2020-01-01T00:00:00.000Z\"}]-->\n";
    const doc = parseBody(markdown);
    expect(doc.attrs?.deletedFootnotes).toEqual([
      {
        id: "gone-1",
        content: "**Lost** note",
        deletedAt: "2020-01-01T00:00:00.000Z",
      },
    ]);
    expect(roundTrip(markdown)).toBe(markdown);
    expect(isLossy(markdown)).toBe(false);
  });

  it("omits the deleted-footnotes trailer when the archive is empty", () => {
    const markdown = "A claim.[^1]\n\n[^1]: Keep me.\n";
    expect(serializeBody(parseBody(markdown))).not.toContain(
      "blogide-deleted-footnotes"
    );
  });
});
