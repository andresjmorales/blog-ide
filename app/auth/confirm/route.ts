import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/siteUrl";

/**
 * Email confirmation / password-recovery landing.
 *
 * Prefer Supabase Auth email templates that link here with token_hash
 * (see docs/HOSTED_OPERATOR.md) so the user never lands on *.supabase.co
 * and recovery works across devices. Also accepts ?code= from the default
 * ConfirmationURL redirect for same-browser PKCE.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), "/reset/confirm");

  const success = new URL(next, origin);
  const failure = new URL("/reset/confirm", origin);
  failure.searchParams.set("error", "auth");

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(success);
    }
    failure.searchParams.set(
      "error_description",
      error.message || "Could not verify the link."
    );
    return NextResponse.redirect(failure);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(success);
    }
    failure.searchParams.set(
      "error_description",
      error.message || "Could not verify the link."
    );
    return NextResponse.redirect(failure);
  }

  failure.searchParams.set(
    "error_description",
    "This link is missing a verification token. Request a new password reset."
  );
  return NextResponse.redirect(failure);
}
