import { describe, expect, it } from "vitest";
import { githubActionMenuItems } from "@/lib/github/menu";

describe("githubActionMenuItems", () => {
  it("nests map, pull, and push with pull disabled until mapped", () => {
    expect(
      githubActionMenuItems({ mapped: false })
    ).toEqual([
      { id: "map-github", label: "Map to GitHub…" },
      { id: "pull-github", label: "Pull from GitHub…", disabled: true },
      { id: "push-github", label: "Push to GitHub" },
    ]);
  });

  it("enables pull when the item is already mapped", () => {
    const pull = githubActionMenuItems({ mapped: true }).find(
      (item) => item.id === "pull-github"
    );
    expect(pull?.disabled).toBe(false);
  });

  it("omits actions the surface cannot run", () => {
    expect(
      githubActionMenuItems({
        mapped: true,
        includeMap: false,
        includePull: false,
      })
    ).toEqual([{ id: "push-github", label: "Push to GitHub" }]);
  });
});
