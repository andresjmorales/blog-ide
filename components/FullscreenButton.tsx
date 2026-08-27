"use client";

import { useSyncExternalStore } from "react";
import { MaximizeIcon, RestoreIcon } from "@/components/icons";
import {
  isFullscreen,
  subscribeFullscreen,
  toggleFullscreen,
} from "@/lib/fullscreen";

function subscribe(onStoreChange: () => void) {
  return subscribeFullscreen(onStoreChange);
}

function getSnapshot() {
  return isFullscreen();
}

function getServerSnapshot() {
  return false;
}

/** Focus mode: enter or leave browser fullscreen (same idea as F11). */
export function FullscreenButton() {
  const active = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  return (
    <button
      type="button"
      className="blogide-chrome-btn is-icon blogide-fullscreen-btn"
      title={active ? "Exit full screen" : "Full screen"}
      aria-label={active ? "Exit full screen" : "Full screen"}
      aria-pressed={active}
      onClick={() => {
        void toggleFullscreen().catch(() => {
          /* unsupported or rejected */
        });
      }}
    >
      {active ? <RestoreIcon /> : <MaximizeIcon />}
    </button>
  );
}
