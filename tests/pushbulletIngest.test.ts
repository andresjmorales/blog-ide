import { describe, expect, it } from "vitest";
import { markIngested, mergePushbulletCursors } from "@/lib/pushbullet/cursor";
import { newestModified, selectPushesToIngest } from "@/lib/pushbullet/ingest";

describe("selectPushesToIngest", () => {
  const deviceToChannel = new Map([
    ["dev-ideas", "chan-ideas"],
    ["dev-general", "chan-general"],
  ]);

  it("keeps only pushes targeted at BlogIDE devices, oldest first", () => {
    const selected = selectPushesToIngest({
      deviceToChannel,
      ingestedIdens: new Set(),
      pushes: [
        {
          iden: "new",
          created: 20,
          target_device_iden: "dev-ideas",
          body: "later",
        },
        {
          iden: "old",
          created: 10,
          target_device_iden: "dev-general",
          body: "earlier",
        },
        {
          iden: "broadcast",
          created: 15,
          body: "sent to all devices",
        },
        {
          iden: "other-phone",
          created: 16,
          target_device_iden: "iphone",
          body: "not for BlogIDE",
        },
      ],
    });
    expect(selected.map((row) => row.push.iden)).toEqual(["old", "new"]);
    expect(selected[0].channelNodeId).toBe("chan-general");
    expect(selected[1].channelNodeId).toBe("chan-ideas");
  });

  it("skips inactive and already ingested pushes", () => {
    const selected = selectPushesToIngest({
      deviceToChannel,
      ingestedIdens: new Set(["seen"]),
      pushes: [
        {
          iden: "seen",
          target_device_iden: "dev-ideas",
          body: "already in notes",
        },
        {
          iden: "deleted",
          active: false,
          target_device_iden: "dev-ideas",
          body: "gone",
        },
      ],
    });
    expect(selected).toEqual([]);
  });
});

describe("newestModified", () => {
  it("returns the highest modified timestamp", () => {
    expect(
      newestModified([
        { iden: "a", modified: 1.5 },
        { iden: "b", modified: 3.2 },
        { iden: "c" },
      ])
    ).toBe(3.2);
    expect(newestModified([])).toBeNull();
  });
});

describe("mergePushbulletCursors", () => {
  it("keeps the account cursor on a new device with empty local state", () => {
    const merged = mergePushbulletCursors(
      { modifiedAfter: null, ingested: [] },
      { modifiedAfter: 100, ingested: ["a"] }
    );
    expect(merged.modifiedAfter).toBe(100);
    expect(merged.ingested).toEqual(["a"]);
  });

  it("does not drop a newer local cursor", () => {
    const merged = mergePushbulletCursors(
      { modifiedAfter: 120, ingested: ["b"] },
      { modifiedAfter: 100, ingested: ["a"] }
    );
    expect(merged.modifiedAfter).toBe(120);
    expect(merged.ingested.sort()).toEqual(["a", "b"]);
  });
});

describe("markIngested", () => {
  it("advances the cursor and records idens", () => {
    const next = markIngested(
      { modifiedAfter: 10, ingested: ["a"] },
      ["b"],
      12
    );
    expect(next.modifiedAfter).toBe(12);
    expect(next.ingested).toEqual(["a", "b"]);
  });

  it("does not move the cursor backwards", () => {
    const next = markIngested(
      { modifiedAfter: 10, ingested: [] },
      [],
      8
    );
    expect(next.modifiedAfter).toBe(10);
  });
});
