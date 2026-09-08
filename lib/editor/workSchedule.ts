/**
 * Shared editor work lanes.
 *
 * Typing is the hot path. Only ProseMirror `apply` and incremental
 * decoration mapping may run there. Whole-document walks, markdown
 * serialize, WASM lint, React inventories, and network stay on a lane.
 *
 * See ARCHITECTURE.md → "Editor runtime".
 */

export const EDITOR_WORK_MS = {
  /** TipTap JSON → markdown (DocumentEditor onUpdate). */
  markdownSerialize: 160,
  /** Outline headings + word counts. */
  outlineStats: 180,
  /** Re-scan Find matches; mapped highlights stay during the wait. */
  findRescan: 250,
  /** Cite / Zotero "Cited here" + optional link inventory + citation prune. */
  citeInventory: 320,
  /** Harper WASM lint of dirty textblocks. Squiggles stay mapped meanwhile. */
  harperLint: 400,
  /** IndexedDB write after markdown is emitted. */
  localPersist: 1000,
  /** Supabase push after a successful local persist. */
  cloudSync: 1500,
} as const;

export type EditorWorkId = string;

type Timer = ReturnType<typeof setTimeout>;

const timers = new Map<EditorWorkId, Timer>();
const pending = new Map<EditorWorkId, () => void>();

/**
 * Coalesce work by id: each call resets the delay. The callback runs once
 * after `delayMs` of quiet. Safe to call from `editor.on("update")`.
 */
export function scheduleEditorWork(
  id: EditorWorkId,
  delayMs: number,
  fn: () => void
): void {
  pending.set(id, fn);
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      const run = pending.get(id);
      pending.delete(id);
      run?.();
    }, delayMs)
  );
}

export function cancelEditorWork(id: EditorWorkId): void {
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.delete(id);
  pending.delete(id);
}

/** Run pending work now (blur, unmount, tests). Omit `id` to flush all. */
export function flushEditorWork(id?: EditorWorkId): void {
  if (id != null) {
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    timers.delete(id);
    const run = pending.get(id);
    pending.delete(id);
    run?.();
    return;
  }
  const ids = [...pending.keys()];
  for (const next of ids) flushEditorWork(next);
}

export function hasScheduledEditorWork(id: EditorWorkId): boolean {
  return pending.has(id);
}

/** Test helper: drop every timer without running callbacks. */
export function resetEditorWorkSchedule(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  pending.clear();
}
