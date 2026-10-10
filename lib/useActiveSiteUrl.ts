"use client";

import { useSyncExternalStore } from "react";
import { getActiveSiteUrl, subscribeActiveSiteUrl } from "@/lib/siteRelative";

/** The main site for the essay on screen; re-renders when it changes. */
export function useActiveSiteUrl(): string {
  return useSyncExternalStore(subscribeActiveSiteUrl, getActiveSiteUrl, () => "");
}
