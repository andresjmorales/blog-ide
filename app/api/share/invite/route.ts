import { NextResponse } from "next/server";
import { EmailSendError, isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { checkRateLimit, hitRateLimit } from "@/lib/rateLimit";
import {
  buildShareInviteEmail,
  essayTitleFromNodeName,
} from "@/lib/sharing/inviteEmail";
import { isShareRole, shareLink } from "@/lib/sharing/types";
import { getPublicSiteUrl } from "@/lib/siteUrl";
import { createClient } from "@/lib/supabase/server";
import { requireSessionUser } from "@/lib/supabase/requireUser";

export const runtime = "nodejs";

/** Per owner: enough for a handful of reviewers, not a mailing list. */
const INVITE_LIMIT = 20;
const INVITE_WINDOW_MS = 60 * 60 * 1000;

function senderName(meta: Record<string, unknown> | undefined, email: string) {
  for (const key of ["full_name", "name", "display_name"]) {
    const value = meta?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return email.split("@")[0] || "Someone";
}

/** Whether BlogIDE can send invites itself (else the UI uses mailto). */
export async function GET() {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  return NextResponse.json({ enabled: isEmailConfigured() });
}

export async function POST(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "Email sending is not set up on this instance." },
      { status: 503 }
    );
  }

  let shareId: unknown;
  try {
    ({ shareId } = (await request.json()) as { shareId?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof shareId !== "string" || !shareId) {
    return NextResponse.json({ error: "Missing share." }, { status: 400 });
  }

  const key = `share-invite:${auth.user.id}`;
  const limited = checkRateLimit(key, INVITE_LIMIT, INVITE_WINDOW_MS);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Too many invites. Try again in ${limited.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  // RLS: owners can only read their own shares and nodes.
  const supabase = await createClient();
  const { data: share, error: shareError } = await supabase
    .from("document_shares")
    .select("id, node_id, grantee_email, role, token")
    .eq("id", shareId)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (shareError || !share || !isShareRole(share.role)) {
    return NextResponse.json({ error: "Share not found." }, { status: 404 });
  }
  const { data: node } = await supabase
    .from("workspace_nodes")
    .select("name")
    .eq("id", share.node_id)
    .maybeSingle();

  const ownerEmail = auth.user.email ?? "";
  const message = buildShareInviteEmail({
    title: essayTitleFromNodeName(node?.name ?? ""),
    link: shareLink(
      share.token,
      process.env.NEXT_PUBLIC_SITE_URL?.trim()
        ? getPublicSiteUrl()
        : new URL(request.url).origin
    ),
    role: share.role,
    inviteeEmail: share.grantee_email,
    senderName: senderName(auth.user.user_metadata, ownerEmail),
  });

  hitRateLimit(key, INVITE_WINDOW_MS);
  try {
    await sendEmail({
      to: share.grantee_email,
      ...message,
      replyTo: ownerEmail || null,
    });
  } catch (err) {
    console.error("share invite: send failed", err);
    const detail = err instanceof EmailSendError ? ` ${err.message}` : "";
    return NextResponse.json(
      { error: `Could not send the invite.${detail}` },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
