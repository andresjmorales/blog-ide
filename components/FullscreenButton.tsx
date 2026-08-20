"use client";

import { useEffect, useState } from "react";
import { MaximizeIcon, RestoreIcon } from "@/components/icons";
import {
  isFullscreen,
  subscribeFullscreen,
  toggleFullscreen,
} from "@/lib/fullscreen";

/** Focus mode: enter or leave browser fullscreen (same idea as F11). */
export function FullscreenButton() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isFullscreen());
    return subscribeFullscreen(() => setActive(isFullscreen()));
  }, []);

  return (
    <button
      type="button"
      className="blogide-chrome-btn is-icon"
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
