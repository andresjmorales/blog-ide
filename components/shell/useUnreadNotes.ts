"use client";

import { useEffect, useState } from "react";
import { subscribeShellSeen } from "@/lib/capture/seen";
import { countUnreadCaptureNotes } from "@/lib/capture/unread";
import type { WorkspaceNode } from "@/lib/workspace/types";

/** Notes newer than the last time the Notes stream was opened. */
export function useUnreadNotes(
  nodes: WorkspaceNode[],
  refreshKey?: number | string
): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void countUnreadCaptureNotes(nodes).then((n) => {
      if (!cancelled) setUnread(n);
    });
    return () => {
      cancelled = true;
    };
  }, [nodes, refreshKey]);

  useEffect(
    () =>
      subscribeShellSeen(() => {
        void countUnreadCaptureNotes(nodes).then(setUnread);
      }),
    [nodes]
  );

  return unread;
}
