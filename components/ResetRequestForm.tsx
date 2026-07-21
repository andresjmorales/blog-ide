"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ResetRequestForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/reset/confirm` }
      );
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold mb-4">Check your email</h1>
        <p className="text-sm text-muted">
          If an account exists for {email}, a password reset link is on its
          way. The link opens a page to choose a new password.
        </p>
        <p className="mt-6 text-sm text-muted">
          <Link
            href="/login"
            className="text-accent underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold mb-8">Reset your password</h1>

      <label className="block mb-6">
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
        {busy ? "Sending…" : "Send reset link"}
      </button>

      <p className="mt-6 text-sm text-muted text-center">
        <Link href="/login" className="text-accent underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
