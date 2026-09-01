import { describe, expect, it } from "vitest";
import {
  PUSHBULLET_PROXY,
  pushbulletRestUrl,
  pushbulletStreamUrl,
} from "@/lib/pushbullet/client";

describe("pushbulletStreamUrl", () => {
  it("puts the token in the path, encoded", () => {
    expect(pushbulletStreamUrl("abc/def")).toBe(
      "wss://stream.pushbullet.com/websocket/abc%2Fdef"
    );
  });
});

describe("pushbulletRestUrl", () => {
  it("uses the same-origin proxy in the browser", () => {
    expect(pushbulletRestUrl("/devices?active=true")).toBe(
      `${PUSHBULLET_PROXY}/devices?active=true`
    );
  });
});

describe("pushbulletStreamUrl", () => {
  it("puts the token in the path, encoded", () => {
    expect(pushbulletStreamUrl("abc/def")).toBe(
      "wss://stream.pushbullet.com/websocket/abc%2Fdef"
    );
  });
});
