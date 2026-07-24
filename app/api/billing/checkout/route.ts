import { NextResponse } from "next/server";
import { isHostedDeployment } from "@/lib/hosted";
import { isStripeBillingConfigured, getStripeProPriceId } from "@/lib/stripe/config";
import { getStripe } from "@/lib/stripe/client";
import { getSiteUrl } from "@/lib/stripe/siteUrl";
import { requireSessionUser } from "@/lib/supabase/requireUser";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Create a Stripe Checkout Session for Hosted Pro (subscription).
 * Hosted deploy + Stripe env only; self-host returns 404.
 */
export async function POST(request: Request) {
  if (!isHostedDeployment() || !isStripeBillingConfigured()) {
    return NextResponse.json(
      { error: "Billing is not available on this deploy." },
      { status: 404 }
    );
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const priceId = getStripeProPriceId();
  if (!priceId) {
    return NextResponse.json(
      { error: "STRIPE_PRICE_ID_PRO is not configured." },
      { status: 503 }
    );
  }
  if (priceId.startsWith("prod_")) {
    return NextResponse.json(
      {
        error:
          "STRIPE_PRICE_ID_PRO looks like a Product id (prod_…). Use the Price id (price_…) from the product’s pricing row.",
      },
      { status: 400 }
    );
  }
  if (!priceId.startsWith("price_")) {
    return NextResponse.json(
      {
        error:
          "STRIPE_PRICE_ID_PRO must be a Price id starting with price_.",
      },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("user_settings")
      .select("plan, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settings?.plan === "pro") {
      return NextResponse.json(
        { error: "Already on Hosted Pro." },
        { status: 409 }
      );
    }

    const stripe = getStripe();
    const siteUrl = getSiteUrl(request);
    let customerId = settings?.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { blogide_user_id: user.id },
      });
      customerId = customer.id;
      await admin
        .from("user_settings")
        .update({
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/editor?billing=success`,
      cancel_url: `${siteUrl}/hosting?billing=canceled`,
      metadata: { blogide_user_id: user.id },
      subscription_data: {
        metadata: { blogide_user_id: user.id },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Checkout session missing URL." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Checkout failed.";
    console.error("[billing/checkout]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
