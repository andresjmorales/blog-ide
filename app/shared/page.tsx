import Link from "next/link";
import { redirect } from "next/navigation";
import { shareViewerPath } from "@/lib/sharing/invite";
import { SHARE_ROLE_LABELS, type SharedWithMe } from "@/lib/sharing/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Shared with me · BlogIDE" };

function essayLabel(name: string): string {
  return name.replace(/\.md$/i, "");
}

export default async function SharedWithMePage() {
  if (!isSupabaseConfigured()) redirect("/editor");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/shared");

  const { data, error } = await supabase.rpc("list_shared_with_me");
  const rows = (data ?? []) as SharedWithMe[];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Shared with me</h1>
        <Link href="/editor" className="text-sm text-muted hover:text-accent">
          Your essays →
        </Link>
      </div>
      {error ? (
        <p className="text-sm text-muted">Could not load shared essays.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing yet. When someone shares a draft with you, open their link
          once and it shows up here.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {rows.map((row) => (
            <li key={row.share_id}>
              <Link
                href={shareViewerPath(row.token)}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-panel"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {essayLabel(row.name)}
                  </span>
                  <span className="block text-xs text-muted">
                    {row.owner_name || "Unknown author"}
                    {row.updated_at
                      ? ` · updated ${new Date(row.updated_at).toLocaleDateString()}`
                      : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {SHARE_ROLE_LABELS[row.role] ?? row.role}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
