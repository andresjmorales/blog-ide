"use client";

import { useEffect } from "react";
import { applyStoredTheme } from "@/lib/theme";

/** Ensures localStorage theme is applied even if the early init script was skipped. */
export function ThemeBoot() {
  useEffect(() => {
    applyStoredTheme();
  }, []);
  return null;
}
