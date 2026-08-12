/**
 * Tiny pub/sub for image / PDF upload progress in the editor chrome.
 * Session-local; not persisted.
 */

export type UploadPhase =
  | "compressing"
  | "uploading"
  | "done"
  | "offline"
  | "error";

export type UploadStatus = {
  id: number;
  phase: UploadPhase;
  /** 0–100 while uploading; null when unknown. */
  progress: number | null;
  message: string;
};

type Listener = () => void;

let current: UploadStatus | null = null;
let nextId = 1;
const listeners = new Set<Listener>();
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

export function getUploadStatus(): UploadStatus | null {
  return current;
}

export function subscribeUploadStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginUploadStatus(
  phase: UploadPhase,
  message: string
): number {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  const id = nextId++;
  current = { id, phase, progress: null, message };
  emit();
  return id;
}

export function updateUploadStatus(
  id: number,
  patch: Partial<Omit<UploadStatus, "id">>
): void {
  if (!current || current.id !== id) return;
  current = { ...current, ...patch };
  emit();
  if (patch.phase === "done" || patch.phase === "offline" || patch.phase === "error") {
    scheduleClear(id, patch.phase === "error" ? 8000 : 4200);
  }
}

function scheduleClear(id: number, ms: number) {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    if (current?.id === id) {
      current = null;
      emit();
    }
    clearTimer = null;
  }, ms);
}

export function clearUploadStatus(id?: number): void {
  if (id != null && current?.id !== id) return;
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  current = null;
  emit();
}
