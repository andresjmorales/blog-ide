import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AppShell } from "@/components/AppShell";
import {
  AVATAR_SIGNED_URL_TTL_SEC,
  AVATARS_BUCKET,
  avatarSourceFromMetadata,
} from "@/lib/avatar/paths";

export const metadata = { title: "Editor · BlogIDE" };

function displayNameFromUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string {
  const meta = user.user_metadata ?? {};
  const fromMeta =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.display_name === "string" && meta.display_name) ||
    "";
  if (fromMeta.trim()) return fromMeta.trim();
  const email = user.email ?? "";
  if (!email) return "Account";
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function avatarUrlForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; user_metadata?: Record<string, unknown> }
): Promise<string | null> {
  const source = avatarSourceFromMetadata(user.user_metadata, user.id);
  if (!source) return null;
  if (source.kind === "url") return source.url;
  // Private bucket: sign per load. A missing object or Storage hiccup falls
  // back to initials rather than a broken image.
  const { data, error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .createSignedUrl(source.path, AVATAR_SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export default async function EditorPage() {
  if (!isSupabaseConfigured()) {
    // Preview mode: Supabase not set up yet, show the shell without auth.
    return <AppShell userEmail="not signed in" displayName="Preview" />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/editor");
  }

  return (
    <AppShell
      userEmail={user.email ?? ""}
      displayName={displayNameFromUser(user)}
      avatarUrl={await avatarUrlForUser(supabase, user)}
    />
  );
}
