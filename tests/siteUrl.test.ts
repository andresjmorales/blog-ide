import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/siteUrl";

describe("safeNextPath", () => {
  it("allows same-origin relative paths", () => {
    expect(safeNextPath("/reset/confirm", "/")).toBe("/reset/confirm");
    expect(safeNextPath("/editor", "/")).toBe("/editor");
  });

  it("rejects open redirects", () => {
    expect(safeNextPath("//evil.example", "/reset/confirm")).toBe(
      "/reset/confirm"
    );
    expect(safeNextPath("https://evil.example", "/reset/confirm")).toBe(
      "/reset/confirm"
    );
    expect(safeNextPath(null, "/reset/confirm")).toBe("/reset/confirm");
  });
});
