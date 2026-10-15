import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireUser";
import { readBodyCapped, safePublicFetch } from "@/lib/preview/ssrf";

export const runtime = "nodejs";

/** Essay images are compressed on upload; this is generous headroom. */
const MAX_BYTES = 25_000_000;
const TIMEOUT_MS = 20_000;

/**
 * Fetch one image from the writer's site for "Export all essays" with site
 * images. The browser can't fetch it directly: most sites send no CORS
 * headers. Only public addresses (every redirect hop is checked) and only
 * image responses.
 */
export async function GET(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await safePublicFetch(url, {
      signal: controller.signal,
      headers: { Accept: "image/*", "User-Agent": "BlogIDE-Export/1.0" },
    });
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      return NextResponse.json(
        { error: `The site answered ${response.status}` },
        { status: 502 }
      );
    }
    const type = (response.headers.get("content-type") || "").split(";")[0].trim();
    if (!type.startsWith("image/")) {
      response.body?.cancel().catch(() => {});
      return NextResponse.json({ error: "Not an image" }, { status: 415 });
    }
    const body = await readBodyCapped(response, MAX_BYTES + 1);
    if (body.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }
    return new NextResponse(body as BodyInit, {
      // Served from our origin: an SVG opened here directly must not run.
      headers: {
        "Content-Type": type,
        "Content-Disposition": "attachment",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    const status =
      message.includes("not allowed") || message.includes("Private") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  } finally {
    clearTimeout(timer);
  }
}
