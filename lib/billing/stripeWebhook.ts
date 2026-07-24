import "server-only";
import type Stripe from "stripe";
import {
  applyHostedPlan,
  findUserIdByStripeCustomerId,
  findUserIdByStripeSubscriptionId,
} from "@/lib/billing/applyPlan";
import { planFromSubscriptionStatus } from "@/lib/billing/plans";

function customerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

async function resolveUserId(params: {
  metadataUserId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}): Promise<string | null> {
  if (params.metadataUserId) return params.metadataUserId;
  if (params.subscriptionId) {
    const bySub = await findUserIdByStripeSubscriptionId(params.subscriptionId);
    if (bySub) return bySub;
  }
  if (params.customerId) {
    return findUserIdByStripeCustomerId(params.customerId);
  }
  return null;
}

async function applySubscription(
  subscription: Stripe.Subscription,
  fallbackUserId?: string | null
): Promise<void> {
  const userId = await resolveUserId({
    metadataUserId:
      fallbackUserId ?? subscription.metadata.blogide_user_id ?? null,
    customerId: customerId(subscription.customer),
    subscriptionId: subscription.id,
  });
  if (!userId) {
    throw new Error(
      `No BlogIDE user for subscription ${subscription.id}`
    );
  }

  const plan = planFromSubscriptionStatus(subscription.status);
  const cancelAt =
    plan === "pro" && subscription.cancel_at
      ? new Date(subscription.cancel_at * 1000).toISOString()
      : null;
  await applyHostedPlan({
    userId,
    plan,
    stripeCustomerId: customerId(subscription.customer),
    stripeSubscriptionId: plan === "free" ? null : subscription.id,
    stripeSubscriptionStatus: subscription.status,
    stripeCancelAt: cancelAt,
  });
}

export async function handleStripeWebhookEvent(
  event: Stripe.Event
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return;
      const userId =
        session.metadata?.blogide_user_id ||
        session.client_reference_id ||
        null;
      const subRef = session.subscription;
      const subscriptionId =
        typeof subRef === "string" ? subRef : subRef?.id ?? null;
      if (!subscriptionId) {
        if (userId) {
          await applyHostedPlan({
            userId,
            plan: "pro",
            stripeCustomerId: customerId(session.customer),
            stripeSubscriptionStatus: "active",
          });
        }
        return;
      }
      // Full subscription object may arrive later via subscription.updated;
      // still apply from session when we have the user.
      if (userId) {
        await applyHostedPlan({
          userId,
          plan: "pro",
          stripeCustomerId: customerId(session.customer),
          stripeSubscriptionId: subscriptionId,
          stripeSubscriptionStatus: "active",
        });
      }
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await applySubscription(subscription);
      return;
    }
    default:
      return;
  }
}
