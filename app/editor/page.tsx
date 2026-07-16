import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { AppShell } from "@/components/AppShell";

export const metadata = { title: "Editor · BlogIDE" };

export default async function EditorPage() {
  if (!isSupabaseConfigured()) {
    // Preview mode: Supabase not set up yet, show the shell without auth.
    return <AppShell userEmail="not signed in" />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/editor");
  }

  return <AppShell userEmail={user.email ?? ""} />;
}
