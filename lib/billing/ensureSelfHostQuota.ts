import "server-only";
import { SELF_HOST_QUOTA_BYTES } from "@/lib/billing/plans";
import { isHostedDeployment } from "@/lib/hosted";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * On self-host deploys, raise `quota_bytes` to {@link SELF_HOST_QUOTA_BYTES}
 * so personal installs are not stuck on the hosted free-tier default.
 * No-op when `NEXT_PUBLIC_HOSTED` is set or the user already has a larger quota.
 */
export async function ensureSelfHostQuota(userId: string): Promise<void> {
  if (isHostedDeployment()) return;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_settings")
    .select("quota_bytes, stripe_subscription_id, stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    const { error: insertError } = await admin.from("user_settings").insert({
      user_id: userId,
      quota_bytes: SELF_HOST_QUOTA_BYTES,
    });
    if (insertError) throw insertError;
    return;
  }

  // Never touch rows that look like hosted billing customers (even after cancel).
  if (data.stripe_subscription_id || data.stripe_customer_id) return;

  const current = Number(data.quota_bytes) || 0;
  if (current >= SELF_HOST_QUOTA_BYTES) return;

  const { error: updateError } = await admin
    .from("user_settings")
    .update({
      quota_bytes: SELF_HOST_QUOTA_BYTES,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (updateError) throw updateError;
}
