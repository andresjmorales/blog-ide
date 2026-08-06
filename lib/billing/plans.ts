/**
 * Public hosted plan limits and display prices.
 *
 * Safe to commit: quotas and list prices are product truth, not secrets.
 * Stripe API keys and the live/test Price id stay in env (see .env.example).
 */

export const BYTES_PER_MIB = 1024 * 1024;
export const BYTES_PER_GIB = 1024 * BYTES_PER_MIB;
export const BYTES_PER_TIB = 1024 * BYTES_PER_GIB;

/** Free hosted invite tier (default `user_settings.quota_bytes` on hosted). */
export const FREE_QUOTA_BYTES = 10 * BYTES_PER_MIB;

/** Hosted Pro combined markdown + Storage quota. */
export const PRO_QUOTA_BYTES = 100 * BYTES_PER_MIB;

/**
 * Self-host installs: BlogIDE does not apply a small SaaS cap.
 * 1 TiB is a soft ceiling; the real limit is the operator’s Supabase plan.
 */
export const SELF_HOST_QUOTA_BYTES = BYTES_PER_TIB;

export function isSelfHostQuota(quotaBytes: number): boolean {
  return quotaBytes >= SELF_HOST_QUOTA_BYTES;
}

/** Display-only monthly price (USD). Stripe Dashboard owns the charged amount. */
export const HOSTED_PRO_PRICE_USD = 5;

export const HOSTED_PRO_PRICE_LABEL = `$${HOSTED_PRO_PRICE_USD}/mo`;

export type HostedPlanId = "free" | "pro";

export type HostedPlan = {
  id: HostedPlanId;
  label: string;
  quotaBytes: number;
  /** Null for free; display string for paid. */
  priceLabel: string | null;
};

export const HOSTED_PLANS: Record<HostedPlanId, HostedPlan> = {
  free: {
    id: "free",
    label: "Free",
    quotaBytes: FREE_QUOTA_BYTES,
    priceLabel: null,
  },
  pro: {
    id: "pro",
    label: "Pro",
    quotaBytes: PRO_QUOTA_BYTES,
    priceLabel: HOSTED_PRO_PRICE_LABEL,
  },
};

export function quotaBytesForPlan(plan: HostedPlanId): number {
  return HOSTED_PLANS[plan].quotaBytes;
}

export function formatQuotaMib(bytes: number): string {
  return `${Math.round(bytes / BYTES_PER_MIB)} MiB`;
}

/** Map Stripe subscription.status → BlogIDE plan (quota applied server-side). */
export function planFromSubscriptionStatus(
  status: string | null | undefined
): HostedPlanId {
  if (
    status === "active" ||
    status === "trialing" ||
    status === "past_due"
  ) {
    return "pro";
  }
  return "free";
}
