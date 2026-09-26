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

  it("rejects backslash and control-character tricks browsers treat as //", () => {
    expect(safeNextPath("/\\evil.example", "/editor")).toBe("/editor");
    expect(safeNextPath("/\t/evil.example", "/editor")).toBe("/editor");
    expect(safeNextPath("/\\/evil.example/x", "/editor")).toBe("/editor");
  });

  it("keeps query and hash on same-origin paths", () => {
    expect(safeNextPath("/editor?doc=1#top", "/")).toBe("/editor?doc=1#top");
  });
});
