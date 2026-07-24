"use client";

import Link from "next/link";
import { useState } from "react";
import { GitHubFooter } from "@/components/GitHubFooter";
import {
  formatQuotaMib,
  FREE_QUOTA_BYTES,
  HOSTED_PRO_PRICE_LABEL,
  PRO_QUOTA_BYTES,
} from "@/lib/billing/plans";
import {
  openBillingPortal,
  startHostedProCheckout,
} from "@/lib/billing/client";
import { PRODUCT_NAME } from "@/lib/brand";

const REPO_URL = "https://github.com/andresjmorales/blog-ide";

type Props = {
  billingAvailable: boolean;
  initialPlan: "free" | "pro";
};

export function HostingOptions({ billingAvailable, initialPlan }: Props) {
  const plan = initialPlan;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUpgrade() {
    setBusy(true);
    setError(null);
    try {
      await startHostedProCheckout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setBusy(false);
    }
  }

  async function onManage() {
    setBusy(true);
    setError(null);
    try {
      await openBillingPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Portal failed.");
      setBusy(false);
    }
  }

  const isPro = plan === "pro";

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="mb-10 w-full max-w-3xl text-center">
        <h1 className="mb-3 text-3xl font-semibold tracking-tight">
          Hosting options
        </h1>
        <p className="text-muted leading-relaxed">
          Run {PRODUCT_NAME} yourself, use the invite-only blogide.com instance,
          or a paid hosted plan with a higher storage quota.
        </p>
      </div>

      <div className="grid w-full max-w-4xl gap-4 md:grid-cols-3">
        <article className="flex flex-col rounded-lg border border-border bg-panel/40 p-5 text-left">
          <h2 className="mb-1 text-lg font-semibold">Self-host</h2>
          <p className="mb-3 text-sm font-medium text-accent">$0</p>
          <p className="mb-4 flex-1 text-sm text-muted leading-relaxed">
            Full product on your own Supabase + Next.js deploy. Your data, your
            keys, no BlogIDE subscription.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-accent underline underline-offset-4"
          >
            Setup on GitHub
          </a>
        </article>

        <article className="flex flex-col rounded-lg border border-border bg-panel/40 p-5 text-left">
          <h2 className="mb-1 text-lg font-semibold">Hosted invite</h2>
          <p className="mb-3 text-sm font-medium text-accent">$0 · beta code</p>
          <p className="mb-4 flex-1 text-sm text-muted leading-relaxed">
            blogide.com: we run it for you. Invite-only while the hosted
            instance is not open to the public. Default{" "}
            {formatQuotaMib(FREE_QUOTA_BYTES)} combined quota (markdown +
            Storage).
          </p>
          <Link
            href="/signup"
            className="text-sm text-accent underline underline-offset-4"
          >
            Sign up with a beta code
          </Link>
        </article>

        <article className="flex flex-col rounded-lg border border-accent/50 bg-accent/5 p-5 text-left">
          <h2 className="mb-1 text-lg font-semibold">Hosted Pro</h2>
          <p className="mb-3 text-sm font-medium text-accent">
            {HOSTED_PRO_PRICE_LABEL}
          </p>
          <p className="mb-4 flex-1 text-sm text-muted leading-relaxed">
            {formatQuotaMib(PRO_QUOTA_BYTES)} combined quota on the hosted
            instance. Cancel anytime via the Stripe customer portal. You can
            always self-host or export instead.
          </p>
          {isPro ? (
            <button
              type="button"
              disabled={busy || !billingAvailable}
              onClick={() => void onManage()}
              className="text-left text-sm text-accent underline underline-offset-4 disabled:opacity-40"
            >
              {busy ? "Opening…" : "Manage billing"}
            </button>
          ) : billingAvailable ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onUpgrade()}
              className="text-left text-sm text-accent underline underline-offset-4 disabled:opacity-40"
            >
              {busy ? "Redirecting…" : "Upgrade with Stripe"}
            </button>
          ) : (
            <span className="text-sm text-muted">
              Checkout not configured on this deploy yet
            </span>
          )}
          {isPro ? (
            <p className="mt-2 text-xs text-muted">Pro subscription active</p>
          ) : null}
        </article>
      </div>

      {error ? (
        <p className="mt-6 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <p className="mt-14 text-sm text-muted">
        <Link
          href="/"
          className="underline underline-offset-4 hover:text-foreground"
        >
          ← Back home
        </Link>
      </p>

      <GitHubFooter />
    </main>
  );
}
