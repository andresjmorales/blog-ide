import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isLossy, roundTrip } from "@/lib/markdown/pipeline";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";

/**
 * Spec principle #3: serializeToMarkdown(parseFromMarkdown(md)) === md for
 * all supported constructs. Every new node type requires new fixtures here
 * (spec §5.1) — a feature does not ship until it survives this suite.
 */

const FIXTURES_DIR = join(__dirname, "fixtures");
const fixtures = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".md"));

describe("markdown round-trip idempotency", () => {
  it("has fixtures to test", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const fixture of fixtures) {
    it(`round-trips ${fixture}`, () => {
      const original = readFileSync(join(FIXTURES_DIR, fixture), "utf8").replace(
        /\r\n/g,
        "\n"
      );
      expect(roundTrip(original)).toBe(original);
    });

    it(`round-trip of ${fixture} is stable on a second pass`, () => {
      const original = readFileSync(join(FIXTURES_DIR, fixture), "utf8").replace(
        /\r\n/g,
        "\n"
      );
      const once = roundTrip(original);
      expect(roundTrip(once)).toBe(once);
    });
  }
});

describe("frontmatter handling", () => {
  it("splits and preserves frontmatter verbatim", () => {
    const md = "---\ntitle: X\nweird:   spacing\n---\nBody text.\n";
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe("---\ntitle: X\nweird:   spacing\n---\n");
    expect(body).toBe("Body text.\n");
  });

  it("tolerates documents without frontmatter", () => {
    const { frontmatter, body } = splitFrontmatter("Just a paragraph.\n");
    expect(frontmatter).toBe("");
    expect(body).toBe("Just a paragraph.\n");
  });

  it("does not treat a mid-document hr as frontmatter", () => {
    const md = "Intro paragraph.\n\n---\n\nMore text.\n";
    const { frontmatter } = splitFrontmatter(md);
    expect(frontmatter).toBe("");
  });

  it("does not flag the blank line after frontmatter as lossy", () => {
    // The personal-site template + packDocument keep one blank line here.
    const md =
      "---\ntitle: T\nsubtitle:\ncanonical:\n---\n\nBody paragraph.\n";
    expect(isLossy(md)).toBe(false);
  });

  it("is not lossy without a blank line after frontmatter either", () => {
    const md = "---\ntitle: T\n---\nBody paragraph.\n";
    expect(isLossy(md)).toBe(false);
  });
});
