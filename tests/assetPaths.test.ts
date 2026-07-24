import { describe, expect, it } from "vitest";
import {
  assetPathFromUrl,
  collectOwnedAssetPaths,
} from "@/lib/assets/paths";
import {
  isHostedDeployment,
  getDeploymentMode,
  requiresBetaCode,
} from "@/lib/hosted";

describe("assetPathFromUrl", () => {
  const userId = "11111111-1111-1111-1111-111111111111";

  it("extracts path from public Supabase assets URLs", () => {
    const url = `https://xyz.supabase.co/storage/v1/object/public/assets/${userId}/123-cover.webp`;
    expect(assetPathFromUrl(url, userId)).toBe(`${userId}/123-cover.webp`);
  });

  it("rejects other users' paths", () => {
    const url = `https://xyz.supabase.co/storage/v1/object/public/assets/other/x.webp`;
    expect(assetPathFromUrl(url, userId)).toBeNull();
  });

  it("collects owned image paths from markdown", () => {
    const md = `![](https://xyz.supabase.co/storage/v1/object/public/assets/${userId}/a.webp)\n![](https://example.com/x.png)`;
    expect(collectOwnedAssetPaths(md, userId)).toEqual([`${userId}/a.webp`]);
  });
});

describe("hosted deployment flag", () => {
  it("defaults to self_hosted", () => {
    expect(isHostedDeployment({})).toBe(false);
    expect(getDeploymentMode({})).toBe("self_hosted");
  });

  it("recognizes NEXT_PUBLIC_HOSTED=true", () => {
    expect(isHostedDeployment({ NEXT_PUBLIC_HOSTED: "true" })).toBe(true);
    expect(getDeploymentMode({ NEXT_PUBLIC_HOSTED: "1" })).toBe("hosted");
  });
});

describe("requiresBetaCode", () => {
  it("falls back to hosted when BETA_ONLY unset", () => {
    expect(requiresBetaCode({})).toBe(false);
    expect(requiresBetaCode({ NEXT_PUBLIC_HOSTED: "true" })).toBe(true);
  });

  it("lets NEXT_PUBLIC_BETA_ONLY override hosted", () => {
    expect(
      requiresBetaCode({
        NEXT_PUBLIC_HOSTED: "true",
        NEXT_PUBLIC_BETA_ONLY: "false",
      })
    ).toBe(false);
    expect(
      requiresBetaCode({
        NEXT_PUBLIC_HOSTED: "false",
        NEXT_PUBLIC_BETA_ONLY: "true",
      })
    ).toBe(true);
  });
});
