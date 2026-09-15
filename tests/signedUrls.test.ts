import { describe, expect, it } from "vitest";
import {
  signedUrlExpirySec,
  signedUrlNeedsRefresh,
} from "@/lib/assets/signedUrls";

function jwtWithExp(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `https://xyz.supabase.co/storage/v1/object/sign/assets/u/a.webp?token=aaa.${payload}.sig`;
}

describe("signed asset URLs", () => {
  it("treats leftover public URLs as needing a refresh", () => {
    expect(
      signedUrlNeedsRefresh(
        "https://xyz.supabase.co/storage/v1/object/public/assets/u/a.webp"
      )
    ).toBe(true);
  });

  it("reads JWT exp from the token query", () => {
    const exp = Math.floor(Date.now() / 1000) + 86_400;
    const url = jwtWithExp(exp);
    expect(signedUrlExpirySec(url)).toBe(exp);
    expect(signedUrlNeedsRefresh(url, exp - 20_000)).toBe(false);
    expect(signedUrlNeedsRefresh(url, exp - 60)).toBe(true);
  });
});
