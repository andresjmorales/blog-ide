import { describe, expect, it } from "vitest";
import { cleanWhitespace } from "@/lib/editor/cleanWhitespace";

describe("cleanWhitespace", () => {
  it("collapses newlines and runs of spaces into single spaces", () => {
    expect(cleanWhitespace("hello\nworld\r\n  from\tPDF")).toBe(
      "hello world from PDF"
    );
  });

  it("trims ends", () => {
    expect(cleanWhitespace("  padded  \n")).toBe("padded");
  });
});
