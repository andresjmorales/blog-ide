"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatQuotaMib, FREE_QUOTA_BYTES } from "@/lib/billing/plans";
import { isHostedDeployment, requiresBetaCode } from "@/lib/hosted";
import { isShareToken } from "@/lib/sharing/invite";
import { safeNextPath } from "@/lib/siteUrl";

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteParam = searchParams.get("invite");
  const inviteToken = isShareToken(inviteParam) ? inviteParam : null;
  // A share invite stands in for a signup code (checked server-side against
  // the invited email).
  const betaRequired = requiresBetaCode() && !inviteToken;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [betaCode, setBetaCode] = useState(searchParams.get("code") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          betaRequired
            ? { email, password, betaCode }
            : inviteToken
              ? { email, password, inviteToken }
              : { email, password }
        ),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Signup failed. Please try again.");
        return;
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError("Account created, but sign-in failed. Try logging in.");
        return;
      }

      router.push(safeNextPath(searchParams.get("next"), "/editor"));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold mb-1">Create your account</h1>
      <p className="text-sm text-muted mb-8 text-balance">
        {inviteToken
          ? "You were invited to a draft. Sign up with the email address the invite was sent to."
          : betaRequired
            ? "You need a signup code to create an account here."
            : isHostedDeployment()
              ? `Free to start, with ${formatQuotaMib(FREE_QUOTA_BYTES)} of storage. No card needed.`
              : "Your drafts are stored in this install's Supabase project."}
      </p>

      <label className="block mb-4">
        <span className="block text-sm mb-1.5">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="w-full rounded-md border border-border bg-panel px-3.5 py-2.5 text-sm outline-none focus:border-accent"
        />
      </label>

      <label className={`block ${betaRequired ? "mb-4" : "mb-6"}`}>
        <span className="block text-sm mb-1.5">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
          className="w-full rounded-md border border-border bg-panel px-3.5 py-2.5 text-sm outline-none focus:border-accent"
        />
      </label>

      {betaRequired ? (
        <label className="block mb-6">
          <span className="block text-sm mb-1.5">Signup code</span>
          <input
            type="text"
            value={betaCode}
            onChange={(e) => setBetaCode(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-panel px-3.5 py-2.5 text-sm font-mono outline-none focus:border-accent"
          />
        </label>
      ) : null}

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Creating account…" : "Sign up"}
      </button>

      <p className="mt-6 text-sm text-muted text-center">
        Already have an account?{" "}
        <Link
          href={
            searchParams.get("next")
              ? `/login?next=${encodeURIComponent(
                  safeNextPath(searchParams.get("next"), "/editor")
                )}`
              : "/login"
          }
          className="text-accent underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
