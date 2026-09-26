import { describe, expect, it } from "vitest";
import { avatarSourceFromMetadata } from "@/lib/avatar/paths";

const uid = "11111111-2222-3333-4444-555555555555";

describe("avatarSourceFromMetadata", () => {
  it("prefers the stored Storage path", () => {
    expect(
      avatarSourceFromMetadata(
        { avatar_path: `${uid}/avatar.webp`, avatar_url: "https://x/y.png" },
        uid
      )
    ).toEqual({ kind: "path", path: `${uid}/avatar.webp` });
  });

  it("recovers the path from a legacy public URL", () => {
    expect(
      avatarSourceFromMetadata(
        {
          avatar_url: `https://xyz.supabase.co/storage/v1/object/public/assets/${uid}/avatar.webp?v=123`,
        },
        uid
      )
    ).toEqual({ kind: "path", path: `${uid}/avatar.webp` });
  });

  it("keeps third-party photo URLs as-is", () => {
    const url = "https://lh3.googleusercontent.com/a/photo";
    expect(avatarSourceFromMetadata({ avatar_url: url }, uid)).toEqual({
      kind: "url",
      url,
    });
  });

  it("ignores another user's path and empty values", () => {
    expect(
      avatarSourceFromMetadata({ avatar_path: "someone-else/avatar.webp" }, uid)
    ).toBeNull();
    expect(
      avatarSourceFromMetadata({ avatar_path: "", avatar_url: "" }, uid)
    ).toBeNull();
    expect(avatarSourceFromMetadata(undefined, uid)).toBeNull();
  });
});
