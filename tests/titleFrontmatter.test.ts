import { describe, expect, it } from "vitest";
import { normalizeEssayTitle } from "@/lib/markdown/docTitle";
import { parseAuthor, writeAuthor } from "@/lib/markdown/author";
import {
  migrateLegacySubtitle,
  parseSubtitle,
  writeSubtitle,
} from "@/lib/markdown/subtitle";
import {
  fileNameToTitle,
  parseTitle,
  titleToFileName,
  writeTitle,
} from "@/lib/markdown/titleFrontmatter";

describe("titleFrontmatter", () => {
  it("round-trips title and file name", () => {
    expect(titleToFileName("My Essay")).toBe("My Essay.md");
    expect(fileNameToTitle("My Essay.md")).toBe("My Essay");
  });

  it("strips path-hostile characters from file names", () => {
    expect(titleToFileName('A / B: "draft"')).toBe("A B draft.md");
  });

  it("reads and writes frontmatter title", () => {
    const fm = "---\ntitle: Old\nstatus: draft\n---\n";
    expect(parseTitle(fm)).toBe("Old");
    expect(writeTitle(fm, "New Title")).toContain("title: New Title");
  });

  it("moves a leading Heading 1 into frontmatter title", () => {
    const md = "---\nstatus: draft\n---\n# New Title 1\n\nBody.\n";
    const next = normalizeEssayTitle(md);
    expect(next.title).toBe("New Title 1");
    expect(next.body).toBe("Body.\n");
    expect(next.frontmatter).toContain("title: New Title 1");
  });

  it("stores subtitle in frontmatter", () => {
    const fm = writeSubtitle("---\ntitle: Essay\n---\n", "A short deck");
    expect(parseSubtitle(fm)).toBe("A short deck");
    expect(fm).toContain("subtitle: A short deck");
  });

  it("migrates a legacy body subtitle marker", () => {
    const legacy =
      "<!--blogide-subtitle-->\nOld deck\n\nParagraph one.\n";
    const migrated = migrateLegacySubtitle(legacy);
    expect(migrated.subtitle).toBe("Old deck");
    expect(migrated.body).toBe("Paragraph one.\n");
  });

  it("stores author in frontmatter", () => {
    const fm = writeAuthor("---\ntitle: Essay\n---\n", "Ada Lovelace");
    expect(parseAuthor(fm)).toBe("Ada Lovelace");
    expect(fm).toContain("author: Ada Lovelace");
    expect(parseAuthor(writeAuthor(fm, ""))).toBe("");
  });
});
