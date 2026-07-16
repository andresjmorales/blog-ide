import { describe, expect, it } from "vitest";
import { normalizeEssayTitle } from "@/lib/markdown/docTitle";
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
});
