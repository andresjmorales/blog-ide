import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  assetPathFromUrl,
  collectOwnedAssetPaths,
} from "@/lib/assets/paths";
import { deleteUserAsset } from "@/lib/assets/upload";
import { listAllDocumentBodies } from "@/lib/workspace/api";

export type QuotaUsage = {
  usedBytes: number;
  quotaBytes: number;
};

export async function fetchQuotaUsage(): Promise<QuotaUsage | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_settings")
    .select("used_bytes, quota_bytes")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { usedBytes: 0, quotaBytes: 20 * 1024 * 1024 };
  return {
    usedBytes: Number(data.used_bytes) || 0,
    quotaBytes: Number(data.quota_bytes) || 20 * 1024 * 1024,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

type UserAssetRow = {
  id: string;
  path: string;
  byte_size: number;
  kind: string;
};

/** Delete essay_image assets not referenced by any document markdown. */
export async function cleanUnusedEssayImages(): Promise<{
  removed: number;
  freedBytes: number;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required");

  const { data: assets, error } = await supabase
    .from("user_assets")
    .select("id, path, byte_size, kind")
    .eq("kind", "essay_image");
  if (error) throw error;

  const bodies = await listAllDocumentBodies();
  const referenced = new Set<string>();
  for (const markdown of bodies.values()) {
    for (const path of collectOwnedAssetPaths(markdown, user.id)) {
      referenced.add(path);
    }
  }

  let removed = 0;
  let freedBytes = 0;
  for (const row of (assets ?? []) as UserAssetRow[]) {
    if (referenced.has(row.path)) continue;
    await deleteUserAsset(row.path);
    removed += 1;
    freedBytes += Number(row.byte_size) || 0;
  }
  return { removed, freedBytes };
}

/**
 * Best-effort: release Storage objects that disappeared from markdown
 * (e.g. image replaced/removed in the editor). Only touches owned URLs.
 */
export async function releaseRemovedEssayImages(
  previousMarkdown: string,
  nextMarkdown: string
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const before = new Set(collectOwnedAssetPaths(previousMarkdown, user.id));
    const after = new Set(collectOwnedAssetPaths(nextMarkdown, user.id));
    for (const path of before) {
      if (after.has(path)) continue;
      try {
        await deleteUserAsset(path);
      } catch {
        /* ignore — sweeper can finish later */
      }
    }
  } catch {
    /* preview / missing env — skip */
  }
}

export function isOwnedAssetUrl(url: string, userId: string): boolean {
  return assetPathFromUrl(url, userId) != null;
}
