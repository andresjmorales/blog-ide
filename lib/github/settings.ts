import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  DEFAULT_GITHUB_SETTINGS,
  type GithubRemoteSettings,
  type GithubSyncMap,
} from "@/lib/github/types";

function asMaps(value: unknown): GithubSyncMap[] {
  if (!Array.isArray(value)) return [];
  const maps: GithubSyncMap[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    if (typeof rec.nodeId !== "string" || !rec.nodeId) continue;
    if (typeof rec.path !== "string") continue;
    maps.push({
      nodeId: rec.nodeId,
      repo: typeof rec.repo === "string" ? rec.repo : "",
      branch: typeof rec.branch === "string" ? rec.branch : "",
      path: rec.path,
    });
  }
  return maps;
}

export async function loadGithubSettings(): Promise<GithubRemoteSettings> {
  if (!isSupabaseConfigured()) return { ...DEFAULT_GITHUB_SETTINGS };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...DEFAULT_GITHUB_SETTINGS };

  const { data, error } = await supabase
    .from("user_settings")
    .select("github_repo, github_branch, github_path, github_maps")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ...DEFAULT_GITHUB_SETTINGS };
  return {
    repo: String(data.github_repo ?? ""),
    branch: String(data.github_branch ?? "main") || "main",
    path: String(data.github_path ?? ""),
    maps: asMaps(data.github_maps),
  };
}

export async function saveGithubSettings(
  settings: GithubRemoteSettings
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Sign in to save GitHub settings.");
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to save GitHub settings.");

  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: user.id,
      github_repo: settings.repo.trim() || null,
      github_branch: settings.branch.trim() || "main",
      github_path: settings.path.trim() || null,
      github_maps: settings.maps,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}
