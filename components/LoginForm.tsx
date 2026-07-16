"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError("Invalid email or password.");
        return;
      }

      router.push(searchParams.get("next") ?? "/editor");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold mb-8">Sign in to BlogIDE</h1>

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

      <label className="block mb-6">
        <span className="block text-sm mb-1.5">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
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
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <p className="mt-6 text-sm text-muted text-center">
        New here?{" "}
        <Link href="/" className="text-accent underline underline-offset-4">
          Enter a beta code
        </Link>
      </p>
    </form>
  );
}
