import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Beta-gated signup (spec §4.2 / §12).
 * Verifies the beta code is unredeemed, creates the user, then marks the
 * code redeemed. If the final claim loses a race, the created user is
 * rolled back. Runs with the service-role key; beta_codes has no client
 * RLS policies, so this route is the only redemption path.
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

  if (!email || !password || !betaCode) {
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

  const admin = createAdminClient();

  const { data: code, error: codeError } = await admin
    .from("beta_codes")
    .select("code, redeemed_by")
    .eq("code", betaCode)
    .maybeSingle();

  if (codeError) {
    return NextResponse.json({ error: "Could not verify beta code." }, { status: 500 });
  }
  if (!code || code.redeemed_by) {
    return NextResponse.json(
      { error: "Invalid or already-redeemed beta code." },
      { status: 403 }
    );
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

  // Claim the code; the `is null` guard makes this atomic against races.
  const { data: claimed, error: claimError } = await admin
    .from("beta_codes")
    .update({ redeemed_by: created.user.id, redeemed_at: new Date().toISOString() })
    .eq("code", betaCode)
    .is("redeemed_by", null)
    .select("code");

  if (claimError || !claimed || claimed.length === 0) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: "Beta code was just redeemed by someone else." },
      { status: 409 }
    );
  }

  await admin.from("user_settings").insert({ user_id: created.user.id });

  return NextResponse.json({ ok: true });
}
