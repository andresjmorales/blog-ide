"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Stage = "verifying" | "ready" | "invalid";

/**
 * Landing page for the password-recovery email link. The link carries a
 * one-time code; exchanging it signs the user in, after which they choose
 * a new password.
 */
export function ResetConfirmForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stage, setStage] = useState<Stage>("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function verify() {
      const supabase = createClient();
      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        setStage(exchangeError ? "invalid" : "ready");
        return;
      }
      // No code param — the client may have already exchanged it
      // (detectSessionInUrl), or the user navigated here while signed in.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      setStage(session ? "ready" : "invalid");
    }
    void verify();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.push("/editor");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (stage === "verifying") {
    return <p className="text-sm text-muted">Checking your reset link…</p>;
  }

  if (stage === "invalid") {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold mb-4">Link expired</h1>
        <p className="text-sm text-muted">
          This reset link is invalid or has expired. Request a fresh one and
          use it within an hour.
        </p>
        <p className="mt-6 text-sm">
          <Link
            href="/reset"
            className="text-accent underline underline-offset-4"
          >
            Request a new link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold mb-8">Choose a new password</h1>

      <label className="block mb-4">
        <span className="block text-sm mb-1.5">New password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          className="w-full rounded-md border border-border bg-panel px-3.5 py-2.5 text-sm outline-none focus:border-accent"
        />
      </label>

      <label className="block mb-6">
        <span className="block text-sm mb-1.5">Repeat password</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
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
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
