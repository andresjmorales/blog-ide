import { NextResponse } from "next/server";
import { AVATARS_BUCKET, avatarSourceFromMetadata } from "@/lib/avatar/paths";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireSessionUser } from "@/lib/supabase/requireUser";

export const runtime = "nodejs";

/** Thread avatars only need to outlast a reading session. */
const PARTICIPANT_AVATAR_TTL_SEC = 60 * 60;
const MAX_PARTICIPANTS = 60;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Participant = { id: string; name: string | null; avatarUrl: string | null };

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Names and short-lived photo URLs for the people on one essay (owner,
 * claimed shares, comment authors). The participant list comes from a
 * definer RPC run as the caller, so someone without access to the essay
 * gets an empty list and can't resolve anyone's photo. Only then does the
 * service role read metadata and sign the private avatar objects.
 */
export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const nodeId = new URL(request.url).searchParams.get("node") ?? "";
  if (!UUID_RE.test(nodeId)) {
    return NextResponse.json({ error: "Missing essay." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("document_comment_participants", {
    p_node_id: nodeId,
  });
  if (error) {
    return NextResponse.json(
      { error: "Could not load participants." },
      { status: 502, headers: NO_STORE }
    );
  }
  const rows = ((data ?? []) as { user_id: string; display_name: string | null }[])
    .filter((row) => typeof row.user_id === "string")
    .slice(0, MAX_PARTICIPANTS);

  const participants: Participant[] = rows.map((row) => ({
    id: row.user_id,
    name: row.display_name,
    avatarUrl: null,
  }));

  if (participants.length > 0 && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createAdminClient();
      const paths = new Map<string, string>();
      await Promise.all(
        participants.map(async (person) => {
          const { data: found } = await admin.auth.admin.getUserById(person.id);
          const source = avatarSourceFromMetadata(
            found.user?.user_metadata,
            person.id
          );
          if (!source) return;
          if (source.kind === "url") person.avatarUrl = source.url;
          else paths.set(source.path, person.id);
        })
      );
      if (paths.size > 0) {
        const { data: signed } = await admin.storage
          .from(AVATARS_BUCKET)
          .createSignedUrls([...paths.keys()], PARTICIPANT_AVATAR_TTL_SEC);
        for (const item of signed ?? []) {
          const owner = item.path ? paths.get(item.path) : undefined;
          const person = participants.find((p) => p.id === owner);
          if (person && item.signedUrl && !item.error) {
            person.avatarUrl = item.signedUrl;
          }
        }
      }
    } catch {
      // Photos are optional; initials cover the rest.
    }
  }

  return NextResponse.json({ participants }, { headers: NO_STORE });
}
