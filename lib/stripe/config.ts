import "server-only";

/**
 * Server-only Stripe env. Keys never go in the public plans config.
 *
 * Required for hosted Checkout:
 * - STRIPE_SECRET_KEY (prefer a restricted key `rk_…` over `sk_…`)
 * - STRIPE_WEBHOOK_SECRET (`whsec_…`)
 * - STRIPE_PRICE_ID_PRO (`price_…` from Dashboard → Product → Price)
 *
 * Optional:
 * - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — only if you add Stripe.js later;
 *   Checkout redirect does not need it.
 */

export function getStripeSecretKey(): string | undefined {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key || undefined;
}

export function getStripeWebhookSecret(): string | undefined {
  const key = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return key || undefined;
}

export function getStripeProPriceId(): string | undefined {
  const id = process.env.STRIPE_PRICE_ID_PRO?.trim();
  return id || undefined;
}

export function isStripeBillingConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(
    env.STRIPE_SECRET_KEY?.trim() &&
      env.STRIPE_WEBHOOK_SECRET?.trim() &&
      env.STRIPE_PRICE_ID_PRO?.trim()
  );
}
