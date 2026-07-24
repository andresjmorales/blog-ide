import { NextResponse } from "next/server";
import { applyHostedPlan } from "@/lib/billing/applyPlan";
import { ensureSelfHostQuota } from "@/lib/billing/ensureSelfHostQuota";
import {
  FREE_QUOTA_BYTES,
  SELF_HOST_QUOTA_BYTES,
  planFromSubscriptionStatus,
  quotaBytesForPlan,
  type HostedPlanId,
} from "@/lib/billing/plans";
import { formatSubscriptionLabel } from "@/lib/billing/subscriptionLabel";
import { isHostedDeployment } from "@/lib/hosted";
import { getStripe } from "@/lib/stripe/client";
import { isStripeBillingConfigured } from "@/lib/stripe/config";
import { requireSessionUser } from "@/lib/supabase/requireUser";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const hosted = isHostedDeployment();
  const billingAvailable = hosted && isStripeBillingConfigured();

  const auth = await requireSessionUser();
  if ("response" in auth) {
    return NextResponse.json({
      billingAvailable,
      plan: "free" as HostedPlanId,
      usedBytes: 0,
      quotaBytes: hosted ? FREE_QUOTA_BYTES : SELF_HOST_QUOTA_BYTES,
      subscriptionStatus: null,
      cancelAt: null,
      subscriptionLabel: null,
      selfHost: !hosted,
    });
  }

  const { user } = auth;

  if (!hosted) {
    try {
      await ensureSelfHostQuota(user.id);
    } catch (err) {
      console.error(
        "[billing/status] self-host quota ensure failed",
        err instanceof Error ? err.message : err
      );
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_settings")
    .select(
      "plan, used_bytes, quota_bytes, stripe_subscription_status, stripe_subscription_id, stripe_cancel_at"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let plan = (data?.plan === "pro" ? "pro" : "free") as HostedPlanId;
  let subscriptionStatus = data?.stripe_subscription_status ?? null;
  let cancelAt = data?.stripe_cancel_at ?? null;
  let quotaBytes =
    Number(data?.quota_bytes) ||
    (hosted ? FREE_QUOTA_BYTES : SELF_HOST_QUOTA_BYTES);
  const usedBytes = Number(data?.used_bytes) || 0;

  // Refresh cancel_at / status from Stripe when we have a subscription id
  // so Account settings stay accurate after portal cancels.
  const subscriptionId = data?.stripe_subscription_id ?? null;
  if (billingAvailable && subscriptionId) {
    try {
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      subscriptionStatus = subscription.status;
      cancelAt = subscription.cancel_at
        ? new Date(subscription.cancel_at * 1000).toISOString()
        : null;
      plan = planFromSubscriptionStatus(subscription.status);
      quotaBytes = quotaBytesForPlan(plan);
      await applyHostedPlan({
        userId: user.id,
        plan,
        stripeSubscriptionId: plan === "free" ? null : subscription.id,
        stripeSubscriptionStatus: subscription.status,
        stripeCancelAt: plan === "pro" ? cancelAt : null,
      });
    } catch (err) {
      console.error(
        "[billing/status] subscription refresh failed",
        err instanceof Error ? err.message : err
      );
    }
  }

  return NextResponse.json({
    billingAvailable,
    plan,
    usedBytes,
    quotaBytes,
    subscriptionStatus,
    cancelAt,
    subscriptionLabel: hosted
      ? formatSubscriptionLabel({
          plan,
          subscriptionStatus,
          cancelAt,
        })
      : null,
    selfHost: !hosted,
  });
}
