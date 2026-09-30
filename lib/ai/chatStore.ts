/**
 * Per-essay AI chats kept in sessionStorage, so a reload restores them but
 * closing the tab still clears them (chat text quotes the essay, and the
 * vault keeps essays out of long-lived plaintext storage where it can).
 */

const STORAGE_KEY = "blogide.aiChats";
/** Older turns drop off first; the whole kept thread is re-sent each turn. */
const MAX_MESSAGES_PER_CHAT = 60;
const MAX_CHATS = 20;

type StoredChats<T> = Record<string, T[]>;

/** Last `max` messages, starting on a user turn (providers require it). */
function trimChat<T extends { role: string }>(messages: T[], max: number): T[] {
  const tail = messages.slice(-max);
  const firstUser = tail.findIndex((m) => m.role === "user");
  return firstUser === -1 ? [] : tail.slice(firstUser);
}

export function loadStoredChats<T extends { role: string }>(): StoredChats<T> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const chats: StoredChats<T> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length > 0) chats[key] = value as T[];
    }
    return chats;
  } catch {
    return {};
  }
}

/**
 * Replace the stored chats. `current` is written last so it survives the
 * chat cap. Storage errors (quota, disabled) only cost the reload restore.
 */
export function saveStoredChats<T extends { role: string }>(
  chats: StoredChats<T>,
  current?: string
): void {
  const entries = Object.entries(chats).filter(
    ([key, messages]) => key !== current && messages.length > 0
  );
  if (current !== undefined && chats[current]?.length) {
    entries.push([current, chats[current]]);
  }
  const kept = Object.fromEntries(
    entries
      .slice(-MAX_CHATS)
      .map(([key, messages]) => [key, trimChat(messages, MAX_MESSAGES_PER_CHAT)] as const)
      .filter(([, messages]) => messages.length > 0)
  );
  try {
    if (Object.keys(kept).length === 0) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Best effort.
  }
}
