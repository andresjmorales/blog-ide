import { describe, expect, it } from "vitest";
import {
  newEssayFrontmatter,
  splitFrontmatter,
} from "@/lib/markdown/frontmatter";
import { parseSubtitle, writeSubtitle } from "@/lib/markdown/subtitle";
import { parseAuthor, writeAuthor } from "@/lib/markdown/author";

describe("newEssayFrontmatter", () => {
  it("matches the personal-site publishing schema", () => {
    const fm = newEssayFrontmatter("My Essay");
    expect(fm).toBe(
      [
        "---",
        "title: My Essay",
        "subtitle:",
        "author:",
        "date:",
        "description:",
        "tags:",
        "canonical:",
        "---",
        "",
        "",
      ].join("\n")
    );
  });

  it("splits cleanly with a blank line before the body", () => {
    const markdown = newEssayFrontmatter("T") + "First paragraph.";
    const { frontmatter, body } = splitFrontmatter(markdown);
    expect(frontmatter.endsWith("---\n")).toBe(true);
    expect(body).toBe("\nFirst paragraph.");
  });

  it("empty template fields parse as empty strings", () => {
    const { frontmatter } = splitFrontmatter(newEssayFrontmatter("T"));
    expect(parseSubtitle(frontmatter)).toBe("");
    expect(parseAuthor(frontmatter)).toBe("");
  });
});

describe("template fields survive edit round-trips", () => {
  const { frontmatter } = splitFrontmatter(newEssayFrontmatter("T"));

  it("clearing subtitle keeps the bare key line", () => {
    const withValue = writeSubtitle(frontmatter, "A deck");
    expect(withValue).toContain("subtitle: A deck");
    const cleared = writeSubtitle(withValue, "");
    expect(cleared).toContain("\nsubtitle:\n");
    expect(parseSubtitle(cleared)).toBe("");
  });

  it("clearing author keeps the bare key line", () => {
    const withValue = writeAuthor(frontmatter, "Andrés Morales");
    expect(withValue).toContain("author: Andrés Morales");
    const cleared = writeAuthor(withValue, "");
    expect(cleared).toContain("\nauthor:\n");
  });

  it("writing empty values over the fresh template is a no-op", () => {
    const packed = writeAuthor(writeSubtitle(frontmatter, ""), "");
    expect(packed).toBe(frontmatter);
  });

  it("does not invent keys on frontmatter that never had them", () => {
    const minimal = "---\ntitle: Old\n---\n";
    expect(writeSubtitle(minimal, "")).toBe(minimal);
    expect(writeAuthor(minimal, "")).toBe(minimal);
  });
});
