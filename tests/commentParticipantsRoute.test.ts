// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getUserById = vi.fn();
const createSignedUrls = vi.fn();
let sessionUser: { id: string } | null = { id: "caller" };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc }),
}));
vi.mock("@/lib/supabase/requireUser", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireSessionUser: async () =>
      sessionUser
        ? { user: sessionUser }
        : { response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) },
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById } },
    storage: { from: () => ({ createSignedUrls }) },
  }),
}));

import { GET } from "@/app/api/comments/participants/route";

const NODE = "10000000-0000-0000-0000-000000000001";
const OWNER = "00000000-0000-0000-0000-00000000000a";
const GLORIA = "00000000-0000-0000-0000-00000000000b";

function get(node = NODE) {
  return GET(new Request(`https://blogide.com/api/comments/participants?node=${node}`));
}

beforeEach(() => {
  rpc.mockReset();
  getUserById.mockReset();
  createSignedUrls.mockReset();
  sessionUser = { id: "caller" };
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
});

describe("GET /api/comments/participants", () => {
  it("requires sign-in", async () => {
    sessionUser = null;
    const res = await get();
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a malformed essay id", async () => {
    const res = await get("not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("returns nothing (and signs nothing) without access", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const res = await get();
    expect(await res.json()).toEqual({ participants: [] });
    expect(getUserById).not.toHaveBeenCalled();
    expect(createSignedUrls).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("signs private photos only for participants", async () => {
    rpc.mockResolvedValue({
      data: [
        { user_id: OWNER, display_name: "Andres" },
        { user_id: GLORIA, display_name: "Gloria" },
      ],
      error: null,
    });
    getUserById.mockImplementation(async (id: string) => ({
      data: {
        user: {
          id,
          user_metadata:
            id === OWNER ? { avatar_path: `${OWNER}/avatar.webp` } : {},
        },
      },
    }));
    createSignedUrls.mockResolvedValue({
      data: [{ path: `${OWNER}/avatar.webp`, signedUrl: "https://signed/owner", error: null }],
    });
    const res = await get();
    const body = (await res.json()) as {
      participants: { id: string; name: string; avatarUrl: string | null }[];
    };
    expect(rpc).toHaveBeenCalledWith("document_comment_participants", { p_node_id: NODE });
    expect(createSignedUrls).toHaveBeenCalledWith([`${OWNER}/avatar.webp`], 3600);
    expect(body.participants).toEqual([
      { id: OWNER, name: "Andres", avatarUrl: "https://signed/owner" },
      { id: GLORIA, name: "Gloria", avatarUrl: null },
    ]);
  });
});
