export type ExplorerFoldState = {
  collapsedIds: string[];
  trashOpen: boolean;
  vaultOpen: boolean;
};

export const DEFAULT_EXPLORER_FOLD: ExplorerFoldState = {
  collapsedIds: [],
  trashOpen: true,
  vaultOpen: true,
};

const KEY_PREFIX = "blogide.explorerFold.v1:";

function storageKey(email: string): string {
  return `${KEY_PREFIX}${email.trim().toLowerCase() || "anon"}`;
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Folder expand/collapse in Files, keyed by account email. */
export function loadExplorerFold(email: string): ExplorerFoldState {
  if (typeof window === "undefined") return { ...DEFAULT_EXPLORER_FOLD };
  try {
    const raw = localStorage.getItem(storageKey(email));
    if (!raw) return { ...DEFAULT_EXPLORER_FOLD };
    const parsed = JSON.parse(raw) as Partial<ExplorerFoldState> & { v?: number };
    if (parsed.v !== 1) return { ...DEFAULT_EXPLORER_FOLD };
    return {
      collapsedIds: asIdList(parsed.collapsedIds),
      trashOpen:
        typeof parsed.trashOpen === "boolean"
          ? parsed.trashOpen
          : DEFAULT_EXPLORER_FOLD.trashOpen,
      vaultOpen:
        typeof parsed.vaultOpen === "boolean"
          ? parsed.vaultOpen
          : DEFAULT_EXPLORER_FOLD.vaultOpen,
    };
  } catch {
    return { ...DEFAULT_EXPLORER_FOLD };
  }
}

export function saveExplorerFold(
  email: string,
  state: ExplorerFoldState
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      storageKey(email),
      JSON.stringify({ v: 1, ...state })
    );
  } catch {
    // quota / private mode
  }
}

export function pruneCollapsedIds(
  collapsedIds: Iterable<string>,
  folderIds: Iterable<string>
): string[] {
  const allowed = new Set(folderIds);
  return [...collapsedIds].filter((id) => allowed.has(id));
}
