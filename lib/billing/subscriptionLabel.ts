import type { HostedPlanId } from "@/lib/billing/plans";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

/** Human label for Account settings near Manage billing. */
export function formatSubscriptionLabel(input: {
  plan: HostedPlanId;
  subscriptionStatus: string | null | undefined;
  cancelAt: string | null | undefined;
}): string | null {
  if (input.plan !== "pro") return null;

  if (input.cancelAt) {
    const when = new Date(input.cancelAt);
    if (!Number.isNaN(when.getTime())) {
      return `Cancels on ${when.toLocaleDateString(undefined, DATE_FORMAT)}`;
    }
  }

  if (input.subscriptionStatus === "past_due") {
    return "Pro subscription active (payment past due)";
  }
  if (input.subscriptionStatus === "trialing") {
    return "Pro trial active";
  }
  return "Pro subscription active";
}
