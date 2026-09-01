import { describe, expect, it } from "vitest";
import {
  deviceFingerprint,
  deviceNickname,
  planDeviceSync,
} from "@/lib/pushbullet/devices";

describe("device naming", () => {
  it("prefixes nicknames so they group in Pushbullet pickers", () => {
    expect(deviceNickname("ideas")).toBe("BlogIDE · ideas");
    expect(deviceFingerprint("abc-123")).toBe("blogide:channel:abc-123");
  });
});

describe("planDeviceSync", () => {
  it("creates a device per Notes channel and maps fingerprints", () => {
    const plan = planDeviceSync({
      channels: [
        { id: "c1", name: "general" },
        { id: "c2", name: "ideas" },
      ],
      devices: [
        {
          iden: "d-general",
          fingerprint: "blogide:channel:c1",
          nickname: "BlogIDE · general",
        },
      ],
    });
    expect(plan.create).toEqual([
      {
        channelId: "c2",
        channelName: "ideas",
        fingerprint: "blogide:channel:c2",
        nickname: "BlogIDE · ideas",
      },
    ]);
    expect(plan.map).toEqual([
      {
        channelId: "c1",
        channelName: "general",
        deviceIden: "d-general",
        nickname: "BlogIDE · general",
      },
    ]);
    expect(plan.rename).toEqual([]);
  });

  it("renames when a channel is renamed", () => {
    const plan = planDeviceSync({
      channels: [{ id: "c1", name: "quotes" }],
      devices: [
        {
          iden: "d1",
          fingerprint: "blogide:channel:c1",
          nickname: "BlogIDE · general",
        },
      ],
    });
    expect(plan.rename).toEqual([{ iden: "d1", nickname: "BlogIDE · quotes" }]);
    expect(plan.create).toEqual([]);
  });

  it("does not reuse a device for two channels", () => {
    const plan = planDeviceSync({
      channels: [
        { id: "c1", name: "general" },
        { id: "c2", name: "general" },
      ],
      devices: [
        {
          iden: "d1",
          nickname: "BlogIDE · general",
        },
      ],
    });
    expect(plan.map).toHaveLength(1);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].channelId).toBe("c2");
  });

  it("ignores inactive devices", () => {
    const plan = planDeviceSync({
      channels: [{ id: "c1", name: "general" }],
      devices: [
        {
          iden: "old",
          active: false,
          fingerprint: "blogide:channel:c1",
        },
      ],
    });
    expect(plan.create).toHaveLength(1);
  });
});
