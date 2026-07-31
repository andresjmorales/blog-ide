import { describe, expect, it } from "vitest";
import {
  parsePublication,
  writePublication,
} from "@/lib/markdown/publication";

describe("parsePublication / writePublication", () => {
  it("reads a bare publication key as empty", () => {
    expect(parsePublication("---\ntitle: T\npublication:\n---\n")).toBe("");
  });

  it("reads a valued publication line", () => {
    const fm = "---\ntitle: T\npublication: First Things\n---\n";
    expect(parsePublication(fm)).toBe("First Things");
  });

  it("strips surrounding quotes", () => {
    expect(
      parsePublication("---\npublication: \"The Atlantic\"\n---\n")
    ).toBe("The Atlantic");
    expect(
      parsePublication("---\npublication: 'Commonweal'\n---\n")
    ).toBe("Commonweal");
  });

  it("clearing keeps the bare key line", () => {
    const withValue = writePublication(
      "---\ntitle: T\npublication: First Things\n---\n",
      ""
    );
    expect(withValue).toContain("\npublication:\n");
    expect(parsePublication(withValue)).toBe("");
  });

  it("does not invent a key on minimal frontmatter", () => {
    const minimal = "---\ntitle: Old\n---\n";
    expect(writePublication(minimal, "")).toBe(minimal);
  });

  it("inserts a valued line before the closing fence when missing", () => {
    const fm = writePublication("---\ntitle: Essay\n---\n", "First Things");
    expect(fm).toContain("publication: First Things");
    expect(parsePublication(fm)).toBe("First Things");
  });

  it("bare key does not swallow the next field", () => {
    const fm = "---\npublication:\ndate: 2026-01-01\n---\n";
    expect(parsePublication(fm)).toBe("");
    expect(fm).toContain("date: 2026-01-01");
  });
});
