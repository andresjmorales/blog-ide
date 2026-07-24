"use client";

export type BillingPlanStatus = {
  plan: "free" | "pro";
  quotaBytes: number;
  usedBytes: number;
  stripeConfigured: boolean;
  subscriptionStatus: string | null;
};

export async function startHostedProCheckout(): Promise<void> {
  const res = await fetch("/api/billing/checkout", { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };
  if (!res.ok || !body.url) {
    throw new Error(body.error || "Could not start checkout.");
  }
  window.location.assign(body.url);
}

export async function openBillingPortal(): Promise<void> {
  const res = await fetch("/api/billing/portal", { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };
  if (!res.ok || !body.url) {
    throw new Error(body.error || "Could not open billing portal.");
  }
  window.location.assign(body.url);
}
