import { describe, expect, it } from "vitest";
import {
  BOOT_DIALOG_AFTER_OFFLINE,
  BOOT_DIALOG_AFTER_ONLINE,
  formatWorkspaceBootLabel,
  nextRetryDelaySec,
  shouldShowConnectionDialog,
} from "@/lib/workspace/bootPolicy";

describe("bootPolicy", () => {
  it("backs off retry delays and then holds", () => {
    expect(nextRetryDelaySec(1)).toBe(4);
    expect(nextRetryDelaySec(2)).toBe(8);
    expect(nextRetryDelaySec(3)).toBe(12);
    expect(nextRetryDelaySec(4)).toBe(20);
    expect(nextRetryDelaySec(9)).toBe(20);
  });

  it("holds the blocking dialog until retries have been visible", () => {
    expect(shouldShowConnectionDialog(0, false, false)).toBe(false);
    expect(
      shouldShowConnectionDialog(BOOT_DIALOG_AFTER_ONLINE - 1, false, false)
    ).toBe(false);
    expect(
      shouldShowConnectionDialog(BOOT_DIALOG_AFTER_ONLINE, false, false)
    ).toBe(true);
    expect(
      shouldShowConnectionDialog(BOOT_DIALOG_AFTER_OFFLINE, false, true)
    ).toBe(true);
    expect(shouldShowConnectionDialog(5, true, false)).toBe(false);
  });

  it("describes connecting, countdown, and offline states", () => {
    expect(
      formatWorkspaceBootLabel({
        inFlight: true,
        failedAttempts: 0,
        retryInSec: null,
        slow: false,
        offline: false,
      })
    ).toBe("Loading workspace…");
    expect(
      formatWorkspaceBootLabel({
        inFlight: true,
        failedAttempts: 0,
        retryInSec: null,
        slow: true,
        offline: false,
      })
    ).toBe("Still connecting to the cloud…");
    expect(
      formatWorkspaceBootLabel({
        inFlight: false,
        failedAttempts: 1,
        retryInSec: 8,
        slow: false,
        offline: false,
      })
    ).toBe("Retrying in 8…");
    expect(
      formatWorkspaceBootLabel({
        inFlight: false,
        failedAttempts: 1,
        retryInSec: 4,
        slow: false,
        offline: true,
      })
    ).toBe("You appear to be offline. Retrying in 4…");
    expect(
      formatWorkspaceBootLabel({
        inFlight: true,
        failedAttempts: 2,
        retryInSec: null,
        slow: false,
        offline: false,
      })
    ).toBe("Trying again…");
  });
});
