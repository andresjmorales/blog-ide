import { describe, expect, it } from "vitest";
import { pushbulletStreamUrl } from "@/lib/pushbullet/client";

describe("pushbulletStreamUrl", () => {
  it("puts the token in the path, encoded", () => {
    expect(pushbulletStreamUrl("abc/def")).toBe(
      "wss://stream.pushbullet.com/websocket/abc%2Fdef"
    );
  });
});
