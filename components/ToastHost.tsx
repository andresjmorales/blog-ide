"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  dismissToast,
  getToasts,
  subscribeToasts,
  type Toast,
} from "@/lib/ui/toast";

export function ToastHost() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, () => []);
  if (toasts.length === 0) return null;
  return (
    <div className="blogide-toasts" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const [openDetail, setOpenDetail] = useState(false);

  useEffect(() => {
    if (toast.durationMs <= 0) return;
    const timer = window.setTimeout(() => dismissToast(toast.id), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.durationMs]);

  return (
    <div
      className={`blogide-toast is-${toast.tone}`}
      role={toast.tone === "error" ? "alert" : "status"}
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
    >
      <div className="blogide-toast-main">
        <div className="blogide-toast-copy">
          {toast.title && <p className="blogide-toast-title">{toast.title}</p>}
          <p className="blogide-toast-message">{toast.message}</p>
        </div>
        <button
          type="button"
          className="blogide-toast-close"
          aria-label="Dismiss"
          onClick={() => dismissToast(toast.id)}
        >
          ×
        </button>
      </div>
      {toast.detail && (
        <div className="blogide-toast-detail">
          <button
            type="button"
            className="blogide-toast-detail-toggle"
            aria-expanded={openDetail}
            onClick={() => setOpenDetail((open) => !open)}
          >
            {openDetail ? "Hide details" : "Details"}
          </button>
          {openDetail && (
            <pre className="blogide-toast-detail-body">{toast.detail}</pre>
          )}
        </div>
      )}
    </div>
  );
}
