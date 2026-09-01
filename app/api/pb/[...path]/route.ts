import { NextResponse } from "next/server";
import { PUSHBULLET_API } from "@/lib/pushbullet/client";
import { isAllowedPushbulletProxyPath } from "@/lib/pushbullet/proxyPath";
import { requireSessionUser } from "@/lib/supabase/requireUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin forwarder so the browser never talks to api.pushbullet.com.
 * Ad blockers (uBlock Origin) commonly block that host as a tracker.
 */
async function proxy(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const { path } = await context.params;
  const parts = (path ?? []).filter(Boolean);
  if (!isAllowedPushbulletProxyPath(parts)) {
    return NextResponse.json(
      { error: "Unknown Pushbullet path." },
      { status: 404 }
    );
  }

  const token = request.headers.get("Access-Token")?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "Missing Access-Token." },
      { status: 401 }
    );
  }

  const search = new URL(request.url).search;
  const dest = `${PUSHBULLET_API}/${parts.join("/")}${search}`;
  const headers = new Headers();
  headers.set("Access-Token", token);
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  const res = await fetch(dest, init);
  const body = await res.arrayBuffer();
  const out = new Headers();
  const ct = res.headers.get("Content-Type");
  if (ct) out.set("Content-Type", ct);
  return new NextResponse(body, { status: res.status, headers: out });
}

export function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, context);
}

export function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, context);
}
