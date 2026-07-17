import { createClient } from "@/lib/supabase/client";

const BUCKET = "assets";

/**
 * Upload a blob to the user's private assets bucket.
 * Returns a path suitable for markdown when a public/signed URL is available.
 * Throws if Storage is not configured / bucket missing.
 */
export async function uploadUserAsset(
  blob: Blob,
  fileName: string
): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to upload assets");

  const safe = fileName.replace(/[^\w.\-]+/g, "_");
  const path = `${user.id}/${Date.now()}-${safe}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (data?.publicUrl) return data.publicUrl;

  const signed = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signed.data?.signedUrl) return signed.data.signedUrl;

  throw new Error("Upload succeeded but no URL was returned");
}
