import Link from "next/link";
import { redirect } from "next/navigation";
import { SharedEssayView } from "@/components/sharing/SharedEssayView";
import { ASSETS_BUCKET } from "@/lib/assets/paths";
import { ASSET_SIGNED_URL_TTL_SEC } from "@/lib/assets/signedUrls";
import { ownerImagePaths, rewriteOwnerImageUrls } from "@/lib/sharing/assets";
import { isShareToken, shareViewerPath } from "@/lib/sharing/invite";
import type { OpenSharedDocumentResult } from "@/lib/sharing/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Shared draft · BlogIDE" };

type Props = { params: Promise<{ token: string }> };

/**
 * Sign the owner's private images for this invitee. The share was already
 * checked by open_shared_document; only paths under the owner's folder that
 * the essay itself references are signed.
 */
async function withViewableImages(
  markdown: string,
  ownerId: string
): Promise<string> {
  const paths = ownerImagePaths(markdown, ownerId);
  if (paths.length === 0 || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return markdown;
  }
  try {
    const { data, error } = await createAdminClient()
      .storage.from(ASSETS_BUCKET)
      .createSignedUrls(paths, ASSET_SIGNED_URL_TTL_SEC);
    if (error) return markdown;
    const signed = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.path && row.signedUrl && !row.error) {
        signed.set(row.path, row.signedUrl);
      }
    }
    return rewriteOwnerImageUrls(markdown, ownerId, signed);
  } catch {
    return markdown;
  }
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="mb-2 text-xl font-semibold">{title}</h1>
      <div className="max-w-sm text-sm text-muted">{children}</div>
    </main>
  );
}

export default async function SharedEssayPage({ params }: Props) {
  const { token } = await params;
  if (!isShareToken(token)) {
    return (
      <Notice title="Link not found">
        This share link is incomplete. Copy the whole link from the invite.
      </Notice>
    );
  }
  if (!isSupabaseConfigured()) {
    return <Notice title="Sharing unavailable">Supabase is not configured.</Notice>;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(shareViewerPath(token))}`);

  const { data, error } = await supabase.rpc("open_shared_document", {
    p_token: token,
  });
  if (error) {
    return (
      <Notice title="Could not open this draft">
        Try again in a moment. If it keeps happening, ask the author to check
        that sharing is set up on their BlogIDE instance.
      </Notice>
    );
  }

  const result = data as OpenSharedDocumentResult;
  if (!result.ok) {
    switch (result.reason) {
      case "owner":
        return (
          <Notice title="This is your essay">
            You shared it from this account.{" "}
            <Link href="/editor" className="text-accent underline underline-offset-4">
              Open the editor
            </Link>
            .
          </Notice>
        );
      case "wrong_account":
        return (
          <Notice title="Signed in as someone else">
            This invite is for <strong>{result.invited_email}</strong>. Sign out
            and sign in (or sign up) with that address to open it.
          </Notice>
        );
      case "claimed":
        return (
          <Notice title="Link already in use">
            Another account already opened this link. Ask the author to reset
            your link from Essay settings → Sharing.
          </Notice>
        );
      case "unavailable":
        return (
          <Notice title="Draft unavailable">
            The author moved this essay to Trash or into their encrypted vault.
          </Notice>
        );
      default:
        return (
          <Notice title="Link not found">
            The author may have removed your access or reset this link.
          </Notice>
        );
    }
  }

  const markdown = await withViewableImages(result.markdown, result.owner_id);

  return (
    <SharedEssayView
      nodeId={result.node_id}
      name={result.name}
      markdown={markdown}
      role={result.role}
      ownerName={result.owner_name}
      updatedAt={result.updated_at}
    />
  );
}
