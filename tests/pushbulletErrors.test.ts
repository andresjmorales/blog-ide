import { describe, expect, it } from "vitest";
import {
  formatPushbulletUserError,
  isPushbulletBlockedError,
} from "@/lib/pushbullet/errors";

describe("formatPushbulletUserError", () => {
  it("recognizes blocker-style fetch failures", () => {
    expect(
      isPushbulletBlockedError(
        new TypeError("NetworkError when attempting to fetch resource.")
      )
    ).toBe(true);
    expect(isPushbulletBlockedError(new TypeError("Failed to fetch"))).toBe(
      true
    );
    expect(formatPushbulletUserError(new TypeError("Failed to fetch"))).toMatch(
      /uBlock Origin/
    );
  });

  it("passes through API messages", () => {
    expect(formatPushbulletUserError(new Error("invalid access token"))).toBe(
      "invalid access token"
    );
    expect(formatPushbulletUserError("Could not sync devices.")).toBe(
      "Could not sync devices."
    );
  });
});
