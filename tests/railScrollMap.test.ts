import { describe, expect, it } from "vitest";
import {
  buildScrollMap,
  essayForRail,
  railForEssay,
} from "@/lib/editor/railScrollMap";

describe("railScrollMap", () => {
  it("lines each note up with its marker at the anchor", () => {
    const map = buildScrollMap(
      [
        { essay: 200, rail: 50 },
        { essay: 900, rail: 400 },
      ],
      2000,
      600
    );
    expect(railForEssay(map, 200)).toBe(50);
    expect(railForEssay(map, 900)).toBe(400);
    expect(essayForRail(map, 400)).toBe(900);
  });

  it("pins both ends together", () => {
    const map = buildScrollMap([{ essay: 500, rail: 100 }], 2000, 600);
    expect(railForEssay(map, 0)).toBe(0);
    expect(railForEssay(map, 2000)).toBe(600);
    expect(railForEssay(map, -10)).toBe(0);
    expect(railForEssay(map, 5000)).toBe(600);
  });

  it("interpolates between anchors (dense notes move the rail faster)", () => {
    const map = buildScrollMap(
      [
        { essay: 100, rail: 100 },
        { essay: 200, rail: 500 },
      ],
      1000,
      900
    );
    expect(railForEssay(map, 150)).toBe(300);
    expect(essayForRail(map, 300)).toBe(150);
  });

  it("drops anchors outside either range or out of order", () => {
    const map = buildScrollMap(
      [
        { essay: -50, rail: 10 },
        { essay: 300, rail: 200 },
        { essay: 250, rail: 260 },
        { essay: 400, rail: 180 },
        { essay: 1500, rail: 900 },
      ],
      1000,
      800
    );
    expect(map.points).toEqual([
      { essay: 0, rail: 0 },
      { essay: 300, rail: 200 },
      { essay: 1000, rail: 800 },
    ]);
  });

  it("handles a rail that cannot scroll", () => {
    const map = buildScrollMap([{ essay: 300, rail: 20 }], 1000, 0);
    expect(railForEssay(map, 500)).toBe(0);
  });
});
