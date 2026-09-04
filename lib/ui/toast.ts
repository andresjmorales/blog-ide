/**
 * Session toasts for short action outcomes. Not persisted.
 */

import { toastCopyFromError } from "@/lib/ui/toastCopy";

export type ToastTone = "info" | "success" | "error";

export type ToastInput = {
  tone?: ToastTone;
  title?: string;
  message: string;
  detail?: string;
  /** Replace an existing toast with the same key instead of stacking. */
  replaceKey?: string;
  /** 0 keeps the toast until dismissed. */
  durationMs?: number;
};

export type Toast = {
  id: number;
  tone: ToastTone;
  title?: string;
  message: string;
  detail?: string;
  replaceKey?: string;
  durationMs: number;
  createdAt: number;
};

type Listener = () => void;

const MAX_TOASTS = 3;
const listeners = new Set<Listener>();
let items: Toast[] = [];
let nextId = 1;

const DEFAULT_DURATION: Record<ToastTone, number> = {
  info: 5000,
  success: 4000,
  error: 8000,
};

function emit() {
  for (const listener of listeners) listener();
}

export function getToasts(): Toast[] {
  return items;
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showToast(input: ToastInput | string): number {
  const spec: ToastInput = typeof input === "string" ? { message: input } : input;
  const tone = spec.tone ?? "info";
  const toast: Toast = {
    id: nextId++,
    tone,
    title: spec.title,
    message: spec.message.trim() || "Something went wrong",
    detail: spec.detail?.trim() || undefined,
    replaceKey: spec.replaceKey,
    durationMs:
      spec.durationMs != null ? spec.durationMs : DEFAULT_DURATION[tone],
    createdAt: Date.now(),
  };

  let next = items;
  if (toast.replaceKey) {
    next = next.filter((item) => item.replaceKey !== toast.replaceKey);
  }
  next = [...next, toast];
  if (next.length > MAX_TOASTS) {
    next = next.slice(next.length - MAX_TOASTS);
  }
  items = next;
  emit();
  return toast.id;
}

export function showSuccessToast(
  message: string,
  title?: string,
  replaceKey?: string
): number {
  return showToast({ tone: "success", message, title, replaceKey });
}

export function showErrorToast(
  error: unknown,
  fallback = "Something went wrong",
  replaceKey?: string
): number {
  const copy = toastCopyFromError(error, fallback);
  return showToast({
    tone: "error",
    message: copy.message,
    detail: copy.detail,
    replaceKey,
  });
}

export function dismissToast(id: number): void {
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return;
  items = next;
  emit();
}

export function clearToasts(): void {
  if (items.length === 0) return;
  items = [];
  emit();
}
