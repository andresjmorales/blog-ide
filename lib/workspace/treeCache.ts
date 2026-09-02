import type { WorkspaceNode } from "@/lib/workspace/types";

const KEY_PREFIX = "blogide.workspaceTree.v1:";

export type CachedWorkspaceTree = {
  v: 1;
  savedAt: string;
  email: string;
  scratchpadId: string | null;
  nodes: WorkspaceNode[];
};

function storageKey(email: string): string {
  return `${KEY_PREFIX}${email.trim().toLowerCase() || "anon"}`;
}

function isNodeShape(value: unknown): value is WorkspaceNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<WorkspaceNode>;
  return (
    typeof node.id === "string" &&
    typeof node.kind === "string" &&
    typeof node.name === "string"
  );
}

export function loadCachedWorkspaceTree(
  email: string
): CachedWorkspaceTree | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedWorkspaceTree>;
    if (parsed.v !== 1 || !Array.isArray(parsed.nodes)) return null;
    if (!parsed.nodes.every(isNodeShape)) return null;
    return {
      v: 1,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
      email: typeof parsed.email === "string" ? parsed.email : email,
      scratchpadId:
        typeof parsed.scratchpadId === "string" ? parsed.scratchpadId : null,
      nodes: parsed.nodes,
    };
  } catch {
    return null;
  }
}

export function saveCachedWorkspaceTree(
  email: string,
  nodes: WorkspaceNode[],
  scratchpadId?: string | null
): void {
  if (typeof window === "undefined") return;
  const payload: CachedWorkspaceTree = {
    v: 1,
    savedAt: new Date().toISOString(),
    email,
    scratchpadId: scratchpadId ?? null,
    nodes,
  };
  try {
    localStorage.setItem(storageKey(email), JSON.stringify(payload));
  } catch {
    // quota / private mode
  }
}
