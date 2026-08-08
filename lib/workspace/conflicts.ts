import type { WorkspaceNode } from "@/lib/workspace/types";

export type ConflictPresentation = {
  badge: "Conflict" | "Local copy";
  createdAt: string | null;
  originId: string | null;
  unresolved: boolean;
  resolvable: boolean;
  legacy: boolean;
};

const LEGACY_CONFLICT_NAME =
  /^(.*) \(conflict (\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})\)\.md$/i;

/** Parse the UTC timestamp used by conflict copies created before metadata. */
export function parseLegacyConflictTimestamp(name: string): string | null {
  const match = LEGACY_CONFLICT_NAME.exec(name);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match[2]
    .split("-")
    .map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }
  return date.toISOString();
}

/** Convert workspace metadata (or a legacy filename) into display behavior. */
export function classifyConflict(
  node: WorkspaceNode
): ConflictPresentation | null {
  if (node.kind !== "document") return null;

  if (
    node.conflict_of &&
    node.conflict_resolution === "keep_both" &&
    node.conflict_resolved_at
  ) {
    return {
      badge: "Local copy",
      createdAt: node.conflict_created_at ?? node.conflict_resolved_at,
      originId: node.conflict_of,
      unresolved: false,
      resolvable: false,
      legacy: false,
    };
  }

  if (
    node.conflict_of &&
    !node.conflict_resolved_at &&
    !node.conflict_resolution
  ) {
    return {
      badge: "Conflict",
      createdAt: node.conflict_created_at ?? null,
      originId: node.conflict_of,
      unresolved: true,
      resolvable: true,
      legacy: false,
    };
  }

  // Resolved discard/replace copies live in Trash for recovery. Their legacy
  // timestamped filename must not make them look unresolved again.
  if (node.conflict_resolved_at || node.conflict_resolution) return null;

  const legacyCreatedAt = parseLegacyConflictTimestamp(node.name);
  if (!legacyCreatedAt) return null;
  return {
    badge: "Conflict",
    createdAt: legacyCreatedAt,
    originId: null,
    unresolved: true,
    resolvable: false,
    legacy: true,
  };
}

export function formatConflictTimestamp(iso: string | null): string {
  if (!iso) return "time unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "time unknown";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
