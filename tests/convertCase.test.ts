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
});
