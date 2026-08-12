"use client";

import { useSyncExternalStore } from "react";
import {
  getUploadStatus,
  subscribeUploadStatus,
} from "@/lib/assets/uploadStatus";

export function UploadStatusBar() {
  const status = useSyncExternalStore(
    subscribeUploadStatus,
    getUploadStatus,
    () => null
  );
  if (!status) return null;

  const percent =
    status.progress != null && status.phase === "uploading"
      ? status.progress
      : null;

  return (
    <div
      className={`upload-status-bar is-${status.phase}`}
      role="status"
      aria-live="polite"
    >
      <span>{status.message}</span>
      {percent != null && (
        <span className="upload-status-bar-pct">{percent}%</span>
      )}
    </div>
  );
}
