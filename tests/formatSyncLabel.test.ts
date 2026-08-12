import { describe, expect, it } from "vitest";
import { formatRelativeSyncAge, formatSyncLabel } from "@/lib/sync/engine";
import type { SyncStatus } from "@/lib/sync/engine";

function status(patch: Partial<SyncStatus>): SyncStatus {
  return {
    focusNodeId: "doc-1",
    localSavedAt: null,
    syncedAt: null,
    dirty: false,
    syncing: false,
    error: null,
    conflictCopyId: null,
    message: null,
    ...patch,
  };
}

describe("formatRelativeSyncAge", () => {
  const now = Date.parse("2026-08-12T12:00:00.000Z");

  it("returns just now under a minute", () => {
    expect(
      formatRelativeSyncAge(new Date(now - 20_000).toISOString(), now)
    ).toBe("just now");
  });

  it("returns minutes under an hour", () => {
    expect(
      formatRelativeSyncAge(new Date(now - 5 * 60_000).toISOString(), now)
    ).toBe("5m");
  });

  it("returns hours and leftover minutes under two days", () => {
    expect(
      formatRelativeSyncAge(
        new Date(now - (6 * 60 + 30) * 60_000).toISOString(),
        now
      )
    ).toBe("6h30m");
    expect(
      formatRelativeSyncAge(new Date(now - 2 * 60 * 60_000).toISOString(), now)
    ).toBe("2h");
  });

  it("returns whole days once over two days", () => {
    // 1970 minutes ≈ 32h50m — still under 2 days, so keep hours/minutes.
    expect(
      formatRelativeSyncAge(
        new Date(now - 1970 * 60_000).toISOString(),
        now
      )
    ).toBe("32h50m");
    expect(
      formatRelativeSyncAge(
        new Date(now - 5 * 24 * 60 * 60_000).toISOString(),
        now
      )
    ).toBe("5d");
  });
});

describe("formatSyncLabel", () => {
  it("uses compact relative ages", () => {
    const syncedAt = new Date(Date.now() - (6 * 60 + 30) * 60_000).toISOString();
    expect(formatSyncLabel(status({ syncedAt }))).toBe(
      "Saved locally · Synced 6h30m ago"
    );
  });
});
