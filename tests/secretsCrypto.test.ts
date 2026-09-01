import { describe, expect, it } from "vitest";
import {
  decryptSecretPayload,
  encryptSecretPayload,
  mergeSecrets,
} from "@/lib/secrets/crypto";

const KEY = "test-encryption-material";

describe("secret payload crypto", () => {
  it("round-trips a Pushbullet token", () => {
    const blob = encryptSecretPayload({ pushbullet: "o.secret-token" }, KEY);
    expect(blob).not.toContain("o.secret-token");
    expect(decryptSecretPayload(blob, KEY)).toEqual({
      pushbullet: "o.secret-token",
    });
  });

  it("fails closed with the wrong key", () => {
    const blob = encryptSecretPayload({ pushbullet: "o.secret-token" }, KEY);
    expect(() => decryptSecretPayload(blob, "other-key")).toThrow();
  });

  it("merges patches without clobbering siblings", () => {
    const merged = mergeSecrets(
      { pushbullet: "keep", ntfy: { server: "https://ntfy.sh", topics: [] } },
      { ntfy: { server: "https://ntfy.example", topics: [{ channelId: "c1", channelName: "ideas", topic: "t1" }] } }
    );
    expect(merged.pushbullet).toBe("keep");
    expect(merged.ntfy?.server).toBe("https://ntfy.example");
    expect(merged.ntfy?.topics).toHaveLength(1);
  });

  it("clears a token when patched empty", () => {
    expect(
      mergeSecrets({ pushbullet: "gone" }, { pushbullet: "" })
    ).toEqual({});
  });
});
