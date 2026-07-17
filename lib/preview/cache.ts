type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function cacheGet<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function cacheSet<T>(
  key: string,
  value: T,
  ttlMs = DEFAULT_TTL_MS
): void {
  store.set(key, { value, expires: Date.now() + ttlMs });
  // Soft cap
  if (store.size > 500) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
}
