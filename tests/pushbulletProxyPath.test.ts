import { describe, expect, it } from "vitest";
import { isAllowedPushbulletProxyPath } from "@/lib/pushbullet/proxyPath";

describe("isAllowedPushbulletProxyPath", () => {
  it("allows the calls BlogIDE makes", () => {
    expect(isAllowedPushbulletProxyPath(["users", "me"])).toBe(true);
    expect(isAllowedPushbulletProxyPath(["devices"])).toBe(true);
    expect(isAllowedPushbulletProxyPath(["devices", "abc-123"])).toBe(true);
    expect(isAllowedPushbulletProxyPath(["pushes"])).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isAllowedPushbulletProxyPath(["users"])).toBe(false);
    expect(isAllowedPushbulletProxyPath(["devices", "abc/../x"])).toBe(false);
    expect(isAllowedPushbulletProxyPath(["pushes", "extra"])).toBe(false);
    expect(isAllowedPushbulletProxyPath(["ephemerals"])).toBe(false);
    expect(isAllowedPushbulletProxyPath([])).toBe(false);
  });
});
