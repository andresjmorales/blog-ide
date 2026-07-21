import { describe, expect, it } from "vitest";
import {
  newEssayFrontmatter,
  splitFrontmatter,
} from "@/lib/markdown/frontmatter";
import { parseSubtitle, writeSubtitle } from "@/lib/markdown/subtitle";
import { parseAuthor, writeAuthor } from "@/lib/markdown/author";
import {
  parseTitle,
  writeTitle,
  yamlTitleLine,
} from "@/lib/markdown/titleFrontmatter";

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

describe("YAML title quoting", () => {
  it("leaves plain titles unquoted", () => {
    expect(yamlTitleLine("The Abolition of Man")).toBe(
      "title: The Abolition of Man"
    );
  });

  it("quotes titles with YAML-significant characters", () => {
    expect(yamlTitleLine("AI: An Excursus")).toBe('title: "AI: An Excursus"');
    expect(yamlTitleLine("#1 Essay")).toBe('title: "#1 Essay"');
    expect(yamlTitleLine('She said "no"')).toBe(
      'title: "She said \\"no\\""'
    );
  });

  it("round-trips a colon title through write + parse", () => {
    const fm = writeTitle("---\ntitle: Old\n---\n", "AI: An Excursus");
    expect(fm).toContain('title: "AI: An Excursus"');
    expect(parseTitle(fm)).toBe("AI: An Excursus");
  });

  it("round-trips embedded quotes", () => {
    const fm = writeTitle("---\ntitle: Old\n---\n", 'On "Truth" and: Method');
    expect(parseTitle(fm)).toBe('On "Truth" and: Method');
  });

  it("newEssayFrontmatter quotes special titles", () => {
    const fm = newEssayFrontmatter("AI: An Excursus");
    expect(fm).toContain('title: "AI: An Excursus"');
    const { frontmatter } = splitFrontmatter(fm);
    expect(parseTitle(frontmatter)).toBe("AI: An Excursus");
  });
});
