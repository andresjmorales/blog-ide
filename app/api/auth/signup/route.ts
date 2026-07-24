import { NextResponse } from "next/server";
import {
  FREE_QUOTA_BYTES,
  SELF_HOST_QUOTA_BYTES,
} from "@/lib/billing/plans";
import { isHostedDeployment } from "@/lib/hosted";
import {
  BETA_GUESS_LIMIT,
  BETA_GUESS_WINDOW_MS,
  checkRateLimit,
  clientIpFromRequest,
  hitRateLimit,
} from "@/lib/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Signup. Hosted deploys require an unredeemed beta code; self-host does not.
 * Self-host accounts get a large `quota_bytes` (Supabase is the real limit).
 * Hosted beta guesses are rate-limited per client IP (best-effort in-memory).
 */
export async function POST(request: Request) {
  let body: { email?: string; password?: string; betaCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const betaCode = body.betaCode?.trim();
  const hosted = isHostedDeployment();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }
  if (hosted && !betaCode) {
    return NextResponse.json(
      { error: "Email, password, and beta code are required." },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("signup: SUPABASE_SERVICE_ROLE_KEY is not set");
    return NextResponse.json(
      {
        error:
          "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add the Secret (or legacy service_role) key in Vercel env vars and redeploy.",
      },
      { status: 500 }
    );
  }

  const admin = createAdminClient();
  const guessKey = hosted
    ? `beta-guess:${clientIpFromRequest(request)}`
    : null;

  if (guessKey) {
    const limited = checkRateLimit(
      guessKey,
      BETA_GUESS_LIMIT,
      BETA_GUESS_WINDOW_MS
    );
    if (!limited.ok) {
      return NextResponse.json(
        {
          error: `Too many beta code attempts. Try again in ${limited.retryAfterSec}s.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec) },
        }
      );
    }
  }

  if (hosted) {
    const { data: code, error: codeError } = await admin
      .from("beta_codes")
      .select("code, redeemed_by")
      .eq("code", betaCode!)
      .maybeSingle();

    if (codeError) {
      console.error("signup: beta_codes lookup failed", codeError);
      return NextResponse.json(
        {
          error:
            "Could not verify beta code (database lookup failed). Check that SUPABASE_SERVICE_ROLE_KEY is the Secret/service_role key for the same project as NEXT_PUBLIC_SUPABASE_URL, and that schema.sql has been run.",
        },
        { status: 500 }
      );
    }
    if (!code || code.redeemed_by) {
      if (guessKey) {
        hitRateLimit(guessKey, BETA_GUESS_WINDOW_MS);
      }
      return NextResponse.json(
        { error: "Invalid or already-redeemed beta code." },
        { status: 403 }
      );
    }
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Could not create account." },
      { status: 400 }
    );
  }

  if (hosted) {
    const { data: claimed, error: claimError } = await admin
      .from("beta_codes")
      .update({
        redeemed_by: created.user.id,
        redeemed_at: new Date().toISOString(),
      })
      .eq("code", betaCode!)
      .is("redeemed_by", null)
      .select("code");

    if (claimError || !claimed || claimed.length === 0) {
      await admin.auth.admin.deleteUser(created.user.id);
      if (guessKey) {
        hitRateLimit(guessKey, BETA_GUESS_WINDOW_MS);
      }
      return NextResponse.json(
        { error: "Beta code was just redeemed by someone else." },
        { status: 409 }
      );
    }
  }

  const quotaBytes = hosted ? FREE_QUOTA_BYTES : SELF_HOST_QUOTA_BYTES;
  const { error: settingsError } = await admin.from("user_settings").insert({
    user_id: created.user.id,
    quota_bytes: quotaBytes,
  });
  if (settingsError) {
    console.error("signup: user_settings insert failed", settingsError);
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: "Account created but settings failed. Try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
