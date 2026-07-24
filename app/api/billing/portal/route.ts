import { NextResponse } from "next/server";
import { isHostedDeployment } from "@/lib/hosted";
import { isStripeBillingConfigured } from "@/lib/stripe/config";
import { getStripe } from "@/lib/stripe/client";
import { getSiteUrl } from "@/lib/stripe/siteUrl";
import { requireSessionUser } from "@/lib/supabase/requireUser";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Stripe Customer Portal for payment method / cancel / resume. */
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

  const supabase = await createClient();
  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!settings?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing customer yet. Upgrade first." },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  const siteUrl = getSiteUrl(request);
  const portal = await stripe.billingPortal.sessions.create({
    customer: settings.stripe_customer_id,
    return_url: `${siteUrl}/editor`,
  });

  return NextResponse.json({ url: portal.url });
}
