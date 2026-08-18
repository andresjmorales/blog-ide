import { describe, expect, it } from "vitest";
import { githubPullBaseVersion } from "@/lib/github/pull";

describe("githubPullBaseVersion", () => {
  it("uses the cloud version when this browser has never opened the essay", () => {
    expect(githubPullBaseVersion(undefined, 7)).toBe(7);
  });

  it("does not fall back to version 1 and mint a conflict copy", () => {
    expect(githubPullBaseVersion(undefined, undefined)).toBe(1);
    expect(githubPullBaseVersion(3, 9)).toBe(9);
    expect(githubPullBaseVersion(12, 4)).toBe(12);
  });
});
