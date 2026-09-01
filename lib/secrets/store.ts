import { createAdminClient } from "@/lib/supabase/admin";
import { decodeSecrets, encodeSecrets } from "@/lib/secrets/server";
import { mergeSecrets } from "@/lib/secrets/crypto";
import { EMPTY_SECRETS, type AccountSecrets } from "@/lib/secrets/types";

export async function readAccountSecrets(
  userId: string
): Promise<AccountSecrets> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_secrets")
    .select("ciphertext")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.ciphertext) return { ...EMPTY_SECRETS };
  return decodeSecrets(String(data.ciphertext));
}

export async function writeAccountSecrets(
  userId: string,
  patch: AccountSecrets
): Promise<AccountSecrets> {
  const current = await readAccountSecrets(userId);
  const next = mergeSecrets(current, patch);
  const admin = createAdminClient();
  const empty = !next.pushbullet && !next.ntfy;
  if (empty) {
    const { error } = await admin
      .from("user_secrets")
      .delete()
      .eq("user_id", userId);
    if (error) throw error;
    return { ...EMPTY_SECRETS };
  }
  const { error } = await admin.from("user_secrets").upsert(
    {
      user_id: userId,
      ciphertext: encodeSecrets(next),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
  return next;
}
