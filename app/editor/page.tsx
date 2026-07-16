import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AppShell } from "@/components/AppShell";

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
    />
  );
}
