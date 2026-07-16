"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BetaCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <form
      className="flex gap-2 max-w-sm mx-auto"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) {
          router.push(`/signup?code=${encodeURIComponent(code.trim())}`);
        }
      }}
    >
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter beta code"
        aria-label="Beta code"
        className="flex-1 rounded-md border border-border bg-panel px-4 py-2.5 text-sm outline-none focus:border-accent"
        required
      />
      <button
        type="submit"
        className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
      >
        Get started
      </button>
    </form>
  );
}
