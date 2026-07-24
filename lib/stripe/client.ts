import "server-only";
import Stripe from "stripe";
import { getStripeSecretKey } from "@/lib/stripe/config";

let stripe: Stripe | null = null;

/** Latest Stripe API version from stripe-best-practices skill. */
const STRIPE_API_VERSION = "2026-06-24.dahlia" as Stripe.LatestApiVersion;

export function getStripe(): Stripe {
  const key = getStripeSecretKey();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  if (!stripe) {
    stripe = new Stripe(key, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
    });
  }
  return stripe;
}
