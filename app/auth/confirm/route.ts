import { NextResponse, type NextRequest } from "next/server";
import {
  classifyVerifyError,
  isEmailOtpType,
  type AuthLinkError,
} from "@/lib/auth/confirmLink";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/siteUrl";

/**
 * Email confirmation / password-recovery landing.
 *
 * Auth email templates link here with token_hash (see
 * docs/HOSTED_OPERATOR.md) so the user never lands on *.supabase.co and
 * recovery works across devices.
 *
 * GET never spends a token_hash: mail security scanners open links before
 * people do, and a one-time token used by a scanner leaves the real click
 * with "link expired". GET forwards to /auth/continue, whose button POSTs
 * back here to verify. A `?code=` (same-browser PKCE) is still exchanged on
 * GET because it only works with this browser's code verifier cookie.
 */
function failure(origin: string, code: AuthLinkError): NextResponse {
  const url = new URL("/reset/confirm", origin);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url, 303);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), "/reset/confirm");

  if (tokenHash && isEmailOtpType(type)) {
    const url = new URL("/auth/continue", origin);
    url.searchParams.set("token_hash", tokenHash);
    url.searchParams.set("type", type);
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, 303);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin), 303);
    return failure(origin, classifyVerifyError(error.message));
  }

  return failure(origin, "missing");
}

export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);

  // Only our own Continue page may post here; a cross-site form could
  // otherwise sign a visitor into someone else's account.
  const sentOrigin = request.headers.get("origin");
  if (sentOrigin !== origin) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return failure(origin, "missing");
  }
  const tokenHash = form.get("token_hash");
  const type = form.get("type");
  const next = safeNextPath(
    typeof form.get("next") === "string" ? (form.get("next") as string) : null,
    "/reset/confirm"
  );
  if (typeof tokenHash !== "string" || !tokenHash || !isEmailOtpType(type)) {
    return failure(origin, "missing");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });
  if (error) return failure(origin, classifyVerifyError(error.message));
  return NextResponse.redirect(new URL(next, origin), 303);
}
