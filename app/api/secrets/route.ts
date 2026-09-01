import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/supabase/requireUser";
import { readAccountSecrets, writeAccountSecrets } from "@/lib/secrets/store";
import type { AccountSecrets } from "@/lib/secrets/types";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  try {
    const secrets = await readAccountSecrets(auth.user.id);
    return NextResponse.json(secrets);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load secrets.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  let patch: AccountSecrets;
  try {
    patch = (await request.json()) as AccountSecrets;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  try {
    const secrets = await writeAccountSecrets(auth.user.id, patch);
    return NextResponse.json(secrets);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not save secrets.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
