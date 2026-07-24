import { redirect } from "next/navigation";
import { HostingOptions } from "@/components/HostingOptions";
import { isHostedDeployment } from "@/lib/hosted";
import { isStripeBillingConfigured } from "@/lib/stripe/config";
import { getSessionUser } from "@/lib/supabase/requireUser";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Hosting options exist only on the hosted deploy (blogide.com).
 * Self-host installs redirect home; no marketing of paid/hosted tiers there.
 */
export default async function HostingPage() {
  if (!isHostedDeployment()) {
    redirect("/");
  }

  let initialPlan: "free" | "pro" = "free";
  if (isSupabaseConfigured()) {
    const user = await getSessionUser();
    if (user) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("user_settings")
        .select("plan")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.plan === "pro") initialPlan = "pro";
    }
  }

  return (
    <HostingOptions
      billingAvailable={isStripeBillingConfigured()}
      initialPlan={initialPlan}
    />
  );
}
