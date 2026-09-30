// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp, exchangeCodeForSession } }),
}));

import { GET, POST } from "@/app/auth/confirm/route";
import {
  AUTH_LINK_ERROR_COPY,
  authLinkErrorCode,
  classifyVerifyError,
} from "@/lib/auth/confirmLink";
import { NextRequest } from "next/server";

const ORIGIN = "https://blogide.com";

function post(fields: Record<string, string>, origin: string | null = ORIGIN) {
  const body = new URLSearchParams(fields);
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (origin) headers.origin = origin;
  return new NextRequest(`${ORIGIN}/auth/confirm`, {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  verifyOtp.mockReset();
  exchangeCodeForSession.mockReset();
});

describe("GET /auth/confirm", () => {
  it("never spends a token_hash; forwards to the Continue page", async () => {
    const res = await GET(
      new NextRequest(
        `${ORIGIN}/auth/confirm?token_hash=abc&type=recovery&next=/reset/confirm`
      )
    );
    expect(verifyOtp).not.toHaveBeenCalled();
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/auth/continue");
    expect(location.searchParams.get("token_hash")).toBe("abc");
    expect(location.searchParams.get("type")).toBe("recovery");
    expect(location.searchParams.get("next")).toBe("/reset/confirm");
  });

  it("drops an off-site next", async () => {
    const res = await GET(
      new NextRequest(
        `${ORIGIN}/auth/confirm?token_hash=abc&type=recovery&next=https://evil.test`
      )
    );
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("next")).toBe("/reset/confirm");
  });

  it("reports a missing token with a code, not free text", async () => {
    const res = await GET(new NextRequest(`${ORIGIN}/auth/confirm`));
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/reset/confirm");
    expect(location.searchParams.get("error")).toBe("missing");
    expect(location.searchParams.has("error_description")).toBe(false);
  });
});

describe("POST /auth/confirm", () => {
  it("verifies the token and continues to next", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await POST(
      post({ token_hash: "abc", type: "recovery", next: "/reset/confirm" })
    );
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/reset/confirm`);
  });

  it("refuses posts from other sites", async () => {
    const res = await POST(
      post({ token_hash: "abc", type: "recovery" }, "https://evil.test")
    );
    expect(res.status).toBe(403);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses posts without an Origin header", async () => {
    const res = await POST(post({ token_hash: "abc", type: "recovery" }, null));
    expect(res.status).toBe(403);
  });

  it("rejects unknown token types", async () => {
    const res = await POST(post({ token_hash: "abc", type: "admin" }));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe(
      "missing"
    );
  });

  it("maps an expired token to the expired code", async () => {
    verifyOtp.mockResolvedValue({
      error: { message: "Email link is invalid or has expired" },
    });
    const res = await POST(post({ token_hash: "abc", type: "recovery" }));
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe(
      "expired"
    );
  });
});

describe("auth link error copy", () => {
  it("only shows fixed messages", () => {
    expect(authLinkErrorCode("expired")).toBe("expired");
    expect(authLinkErrorCode("Your account is locked, call 555")).toBe("invalid");
    expect(authLinkErrorCode(null)).toBeNull();
    expect(AUTH_LINK_ERROR_COPY.invalid).not.toContain("555");
  });

  it("classifies verify errors", () => {
    expect(classifyVerifyError("Token has expired or is invalid")).toBe("expired");
    expect(classifyVerifyError("boom")).toBe("invalid");
  });
});
