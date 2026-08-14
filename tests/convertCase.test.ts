import { describe, expect, it } from "vitest";
import { convertCase } from "@/lib/editor/convertCase";

describe("convertCase", () => {
  it("upper / lower / sentence", () => {
    expect(convertCase("hello WORLD", "upper")).toBe("HELLO WORLD");
    expect(convertCase("Hello WORLD", "lower")).toBe("hello world");
    expect(convertCase("hello WORLD. next", "sentence")).toBe(
      "Hello world. next"
    );
  });

  it("capitalized every word", () => {
    expect(convertCase("ai: an excursus", "capitalized")).toBe(
      "Ai: An Excursus"
    );
  });

  it("title case skips small prepositions except ends", () => {
    expect(convertCase("ai: an excursus on the mind", "title")).toBe(
      "Ai: an Excursus on the Mind"
    );
    expect(convertCase("of mice and men", "title")).toBe("Of Mice and Men");
  });

  it("preserves surrounding whitespace", () => {
    expect(convertCase("  hello  ", "upper")).toBe("  HELLO  ");
  });

  it("keeps Shift-Enter newlines (single \\n, no blank line)", () => {
    expect(convertCase("hello\nworld", "upper")).toBe("HELLO\nWORLD");
    expect(convertCase("hello\nworld", "lower")).toBe("hello\nworld");
    expect(convertCase("hello\nworld", "sentence")).toBe("Hello\nworld");
    expect(convertCase("hello\nworld", "capitalized")).toBe("Hello\nWorld");
    expect(convertCase("of mice\nand men", "title")).toBe("Of Mice\nand Men");
  });

  it("keeps paragraph breaks (blank lines)", () => {
    expect(convertCase("hello\n\nworld", "upper")).toBe("HELLO\n\nWORLD");
    expect(convertCase("hello\n\nworld", "sentence")).toBe("Hello\n\nworld");
    expect(convertCase("hello\n\n\n\nworld", "lower")).toBe("hello\n\n\n\nworld");
  });
});
