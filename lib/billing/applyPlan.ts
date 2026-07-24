import "server-only";
import {
  type HostedPlanId,
  quotaBytesForPlan,
} from "@/lib/billing/plans";
import { createAdminClient } from "@/lib/supabase/admin";

export type ApplyHostedPlanInput = {
  userId: string;
  plan: HostedPlanId;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionStatus?: string | null;
  /** ISO timestamp when the subscription will/did cancel; null clears. */
  stripeCancelAt?: string | null;
};

/**
 * Authoritative plan → quota write (service role). Clients cannot set
 * quota_bytes or plan columns via PostgREST grants.
 */
export async function applyHostedPlan(
  input: ApplyHostedPlanInput
): Promise<void> {
  const admin = createAdminClient();
  const quotaBytes = quotaBytesForPlan(input.plan);
  const patch: Record<string, unknown> = {
    plan: input.plan,
    quota_bytes: quotaBytes,
    updated_at: new Date().toISOString(),
  };
  if (input.stripeCustomerId !== undefined) {
    patch.stripe_customer_id = input.stripeCustomerId;
  }
  if (input.stripeSubscriptionId !== undefined) {
    patch.stripe_subscription_id = input.stripeSubscriptionId;
  }
  if (input.stripeSubscriptionStatus !== undefined) {
    patch.stripe_subscription_status = input.stripeSubscriptionStatus;
  }
  if (input.stripeCancelAt !== undefined) {
    patch.stripe_cancel_at = input.stripeCancelAt;
  }
  if (input.plan === "free") {
    patch.stripe_cancel_at = null;
  }

  const { data: existing, error: lookupError } = await admin
    .from("user_settings")
    .select("user_id")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (!existing) {
    const { error } = await admin.from("user_settings").insert({
      user_id: input.userId,
      ...patch,
    });
    if (error) throw error;
    return;
  }

  const { error } = await admin
    .from("user_settings")
    .update(patch)
    .eq("user_id", input.userId);
  if (error) throw error;
}

export async function findUserIdByStripeCustomerId(
  customerId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_settings")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data?.user_id ?? null;
}

export async function findUserIdByStripeSubscriptionId(
  subscriptionId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_settings")
    .select("user_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (error) throw error;
  return data?.user_id ?? null;
}
