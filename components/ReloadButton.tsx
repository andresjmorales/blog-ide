"use client";

import { useState } from "react";
import { ReloadIcon } from "@/components/icons";

/**
 * Header reload. Mobile browsers (Firefox especially) can leave a
 * backgrounded tab stale, and pull-to-refresh only works from the very top
 * of the page — the app scrolls in inner panes, so that is rarely reachable.
 * Saves the open draft first so a reload never drops typing.
 */
export function ReloadButton({
  onBeforeReload,
}: {
  onBeforeReload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      title="Reload"
      aria-label="Reload"
      disabled={busy}
      className="rounded p-1.5 text-muted hover:bg-panel hover:text-foreground disabled:opacity-60"
      onClick={() => {
        setBusy(true);
        void onBeforeReload()
          .catch(() => {
            // The draft is still in IndexedDB or memory; reloading reopens
            // dirty local copies before the cloud one.
          })
          .finally(() => window.location.reload());
      }}
    >
      <ReloadIcon className={busy ? "animate-spin" : undefined} />
    </button>
  );
}
