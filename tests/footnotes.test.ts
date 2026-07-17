import { describe, expect, it } from "vitest";
import {
  isLossy,
  parseBody,
  roundTrip,
  serializeBody,
} from "@/lib/markdown/pipeline";
import { packStickySidenotes } from "@/lib/editor/sidenoteLayout";

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

describe("sticky sidenote packing", () => {
  it("keeps notes inside the viewport and marks the closest as primary", () => {
    const packed = packStickySidenotes(
      [
        { id: "a", naturalTop: 10, height: 40 },
        { id: "b", naturalTop: 80, height: 40 },
        { id: "c", naturalTop: 400, height: 40 },
      ],
      0,
      200,
      90
    );

    expect(packed.find((item) => item.id === "b")?.primary).toBe(true);
    for (const item of packed) {
      expect(item.top).toBeGreaterThanOrEqual(8);
      expect(item.top + item.height).toBeLessThanOrEqual(200);
    }
    expect(packed[1].top).toBeGreaterThanOrEqual(
      packed[0].top + packed[0].height
    );
  });

  it("truncates before dropping when the gutter is crowded", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: String(i + 1),
      naturalTop: 30 + i * 25,
      height: 80,
    }));
    const packed = packStickySidenotes(items, 0, 240, 100);
    expect(packed.length).toBeGreaterThanOrEqual(4);
    expect(packed.some((item) => item.truncated)).toBe(true);
    for (const item of packed) {
      expect(item.top).toBeGreaterThanOrEqual(8);
      expect(item.top + item.height).toBeLessThanOrEqual(240);
    }
  });

  it("lets early notes leave only after min-height rows are exhausted", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: String(i + 1),
      naturalTop: 10 + i * 15,
      height: 48,
    }));
    const packed = packStickySidenotes(items, 0, 240, 220);
    const ids = new Set(packed.map((item) => item.id));
    expect(ids.has("1")).toBe(false);
    expect(packed.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps nearby notes when anchors sit above the viewport", () => {
    const packed = packStickySidenotes(
      [
        { id: "1", naturalTop: -400, height: 40 },
        { id: "2", naturalTop: -300, height: 40 },
        { id: "3", naturalTop: -80, height: 40 },
        { id: "4", naturalTop: 40, height: 40 },
      ],
      0,
      200,
      100
    );
    expect(packed.length).toBeGreaterThan(0);
    expect(packed.some((item) => item.id === "4")).toBe(true);
  });

  it("does not overlap and lets the last note use remaining gutter space", () => {
    const packed = packStickySidenotes(
      [
        { id: "23", naturalTop: 80, height: 200 },
        { id: "24", naturalTop: 160, height: 80 },
      ],
      0,
      300,
      200
    );
    expect(packed).toHaveLength(2);
    for (let i = 0; i < packed.length - 1; i += 1) {
      expect(packed[i].top + packed[i].height).toBeLessThanOrEqual(
        packed[i + 1].top
      );
    }
    const last = packed[packed.length - 1];
    expect(last.top + last.height).toBeLessThanOrEqual(300);
    // Last note should expand toward its natural height when space remains.
    expect(last.height).toBeGreaterThanOrEqual(36);
  });
});
