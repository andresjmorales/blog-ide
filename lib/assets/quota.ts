import { FREE_QUOTA_BYTES } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/client";
import {
  assetPathFromUrl,
  collectOwnedAssetPaths,
} from "@/lib/assets/paths";
import { deleteUserAsset } from "@/lib/assets/upload";
import { listLocalDocs } from "@/lib/db/indexed";
import { listAllMarkdownForSweep } from "@/lib/workspace/api";

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
  if (!data) return { usedBytes: 0, quotaBytes: FREE_QUOTA_BYTES };
  return {
    usedBytes: Number(data.used_bytes) || 0,
    quotaBytes: Number(data.quota_bytes) || FREE_QUOTA_BYTES,
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

  // Live essays, their version history (restorable), and unsynced drafts on
  // this device all count as references.
  const { bodies, unreadable } = await listAllMarkdownForSweep();
  if (unreadable > 0) {
    throw new Error(
      "Unlock the vault first — its essays may use some of these images."
    );
  }
  try {
    for (const local of await listLocalDocs()) {
      if (local.dirty) bodies.push(local.markdown);
    }
  } catch {
    // No IndexedDB (private mode) — nothing unsynced to protect here.
  }
  const referenced = new Set<string>();
  for (const markdown of bodies) {
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

export function isOwnedAssetUrl(url: string, userId: string): boolean {
  return assetPathFromUrl(url, userId) != null;
}
