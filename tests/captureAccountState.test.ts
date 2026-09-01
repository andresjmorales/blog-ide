import { describe, expect, it } from "vitest";
import {
  mergeIdLists,
  parseCaptureState,
} from "@/lib/capture/accountState";

describe("parseCaptureState", () => {
  it("reads pushbullet and ntfy cursors", () => {
    expect(
      parseCaptureState({
        pushbullet: { modifiedAfter: 10, ingested: ["p1"] },
        ntfy: { since: 4, ingested: ["n1"] },
      })
    ).toEqual({
      pushbullet: { modifiedAfter: 10, ingested: ["p1"] },
      ntfy: { since: 4, ingested: ["n1"] },
    });
  });

  it("ignores junk", () => {
    expect(parseCaptureState(null)).toEqual({});
    expect(parseCaptureState({ pushbullet: "nope" })).toEqual({});
  });
});

describe("mergeIdLists", () => {
  it("unions and caps", () => {
    expect(mergeIdLists(["a"], ["b", "a"], 10)).toEqual(["a", "b"]);
  });
});
