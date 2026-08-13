import { describe, expect, it } from "vitest";
import { newEssayFrontmatter } from "@/lib/markdown/frontmatter";
import {
  extraFrontmatterFields,
  isReservedFrontmatterKey,
  isValidFrontmatterKey,
  parseFrontmatterField,
  parseFrontmatterFields,
  removeFrontmatterField,
  writeFrontmatterField,
} from "@/lib/markdown/yamlFields";

describe("yamlFields", () => {
  it("lists template keys even when empty and custom keys separately", () => {
    const fm = newEssayFrontmatter("Essay");
    const { template, custom } = extraFrontmatterFields(fm);
    expect(template.map((field) => field.key)).toEqual([
      "author",
      "publication",
      "date",
      "description",
      "tags",
      "canonical",
      "status",
    ]);
    expect(template.find((field) => field.key === "status")?.value).toBe(
      "draft"
    );
    expect(custom).toEqual([]);
  });

  it("surfaces unknown keys as custom fields", () => {
    const fm = "---\ntitle: T\nsubtitle:\nhero_image: cover.webp\n---\n";
    const { custom } = extraFrontmatterFields(fm);
    expect(custom).toEqual([{ key: "hero_image", value: "cover.webp" }]);
  });

  it("hides title, subtitle, and spellcheck from extra fields", () => {
    const fm =
      "---\ntitle: T\nsubtitle: Deck\nspellcheck: off\nspellcheck_langs: en-US\nfoo: 1\n---\n";
    const keys = parseFrontmatterFields(fm).map((field) => field.key);
    expect(keys).toContain("title");
    const { custom } = extraFrontmatterFields(fm);
    expect(custom.map((field) => field.key)).toEqual(["foo"]);
  });

  it("writes, clears, and does not invent missing template keys", () => {
    const minimal = "---\ntitle: Essay\n---\n";
    expect(writeFrontmatterField(minimal, "date", "")).toBe(minimal);
    const withDate = writeFrontmatterField(minimal, "date", "2026-08-13");
    expect(withDate).toContain("date: 2026-08-13");
    expect(parseFrontmatterField(withDate, "date")).toBe("2026-08-13");
    const cleared = writeFrontmatterField(withDate, "date", "");
    expect(cleared).toContain("\ndate:\n");
    expect(parseFrontmatterField(cleared, "date")).toBe("");
  });

  it("adds and removes custom keys without touching neighbors", () => {
    const fm = "---\ntitle: Essay\nstatus: draft\n---\n";
    const added = writeFrontmatterField(fm, "series", "Letters", {
      keepEmpty: true,
      create: true,
    });
    expect(added).toContain("series: Letters");
    expect(added).toContain("status: draft");
    const removed = removeFrontmatterField(added, "series");
    expect(removed).not.toContain("series:");
    expect(removed).toContain("status: draft");
    expect(removed).toContain("title: Essay");
  });

  it("unquotes stored scalars", () => {
    const fm = '---\ndescription: "A: summary"\n---\n';
    expect(parseFrontmatterField(fm, "description")).toBe("A: summary");
  });

  it("validates custom keys", () => {
    expect(isValidFrontmatterKey("hero_image")).toBe(true);
    expect(isValidFrontmatterKey("og-title")).toBe(true);
    expect(isValidFrontmatterKey("1bad")).toBe(false);
    expect(isValidFrontmatterKey("has space")).toBe(false);
    expect(isReservedFrontmatterKey("title")).toBe(true);
    expect(isReservedFrontmatterKey("spellcheck_langs")).toBe(true);
    expect(isReservedFrontmatterKey("author")).toBe(false);
  });
});
