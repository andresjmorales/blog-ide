import { describe, expect, it } from "vitest";
import { ownerImagePaths, rewriteOwnerImageUrls } from "@/lib/sharing/assets";
import {
  inviteSignupHref,
  isShareToken,
  shareTokenFromNextPath,
} from "@/lib/sharing/invite";
import {
  isShareRole,
  normalizeShareEmail,
  shareFailureMessage,
  shareInviteMailto,
  shareLink,
} from "@/lib/sharing/types";

const TOKEN = "a".repeat(32) + "0123456789abcdef".repeat(2);
const OWNER = "11111111-2222-3333-4444-555555555555";
const BASE = "https://proj.supabase.co/storage/v1/object";

describe("share tokens and links", () => {
  it("accepts only 64-char lowercase hex tokens", () => {
    expect(isShareToken(TOKEN)).toBe(true);
    expect(isShareToken(TOKEN.toUpperCase())).toBe(false);
    expect(isShareToken(TOKEN.slice(1))).toBe(false);
    expect(isShareToken(null)).toBe(false);
  });

  it("builds a persistent per-person link", () => {
    expect(shareLink(TOKEN, "https://blogide.com/")).toBe(
      `https://blogide.com/s/${TOKEN}`
    );
  });

  it("reads the invite token from a login next path", () => {
    expect(shareTokenFromNextPath(`/s/${TOKEN}`)).toBe(TOKEN);
    expect(shareTokenFromNextPath(`/s/${TOKEN}?x=1`)).toBe(TOKEN);
    expect(shareTokenFromNextPath("/editor")).toBeNull();
    expect(shareTokenFromNextPath("/s/not-a-token")).toBeNull();
    expect(shareTokenFromNextPath(null)).toBeNull();
  });

  it("sends invitees to signup and back to the essay", () => {
    const href = inviteSignupHref(TOKEN);
    const params = new URL(href, "https://x.test").searchParams;
    expect(params.get("invite")).toBe(TOKEN);
    expect(params.get("next")).toBe(`/s/${TOKEN}`);
  });
});

describe("share form helpers", () => {
  it("normalizes emails and rejects partial ones", () => {
    expect(normalizeShareEmail("  Wife@Example.COM ")).toBe("wife@example.com");
    expect(normalizeShareEmail("wife@example")).toBeNull();
    expect(normalizeShareEmail("wife")).toBeNull();
  });

  it("knows the three roles", () => {
    expect(isShareRole("commenter")).toBe(true);
    expect(isShareRole("owner")).toBe(false);
  });

  it("explains server refusals", () => {
    expect(shareFailureMessage("vault")).toMatch(/can't be shared/);
    expect(shareFailureMessage("mystery")).toBe("Could not update sharing.");
  });

  it("prefills an invite email with the link and access", () => {
    const href = shareInviteMailto({
      email: "wife@example.com",
      title: "On Rest",
      link: `https://blogide.com/s/${TOKEN}`,
      role: "commenter",
    });
    expect(href.startsWith("mailto:wife%40example.com?")).toBe(true);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("subject")).toBe("Draft: On Rest");
    expect(params.get("body")).toContain("read and comment on “On Rest”");
    expect(params.get("body")).toContain(`/s/${TOKEN}`);
  });
});

describe("shared essay images", () => {
  const md = [
    `![a](${BASE}/public/assets/${OWNER}/img/a.webp)`,
    `![b](<${BASE}/sign/assets/${OWNER}/img/b.webp?token=old>)`,
    `![c](${BASE}/public/assets/someone-else/c.webp)`,
    "![d](https://example.com/d.png)",
  ].join("\n\n");

  it("collects only the owner's storage paths", () => {
    expect(ownerImagePaths(md, OWNER)).toEqual([
      `${OWNER}/img/a.webp`,
      `${OWNER}/img/b.webp`,
    ]);
  });

  it("swaps in signed URLs and leaves everything else alone", () => {
    const signed = new Map([
      [`${OWNER}/img/a.webp`, "https://signed/a"],
      [`${OWNER}/img/b.webp`, "https://signed/b"],
    ]);
    const out = rewriteOwnerImageUrls(md, OWNER, signed);
    expect(out).toContain("![a](https://signed/a)");
    expect(out).toContain("![b](<https://signed/b>)");
    expect(out).toContain("someone-else/c.webp");
    expect(out).toContain("https://example.com/d.png");
  });
});
