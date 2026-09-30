import {
  isCommentAnchor,
  normalizeAnchor,
  type CommentAnchor,
} from "@/lib/comments/anchors";
import type { ShareRole } from "@/lib/sharing/types";

/** The caller's relationship to an essay's comments. */
export type CommentAccess = "owner" | ShareRole;

export type CommentStatus = "open" | "resolved" | "accepted" | "rejected";

export type CommentRow = {
  id: string;
  thread_id: string | null;
  author_id: string;
  author_name: string | null;
  kind: "comment" | "suggestion";
  anchor: CommentAnchor | null;
  body: string;
  status: CommentStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

export type CommentThread = {
  id: string;
  root: CommentRow & { anchor: CommentAnchor };
  replies: CommentRow[];
};

/** Where a thread's anchor landed on the last resolve. */
export type ThreadPlacement = {
  detached: boolean;
  /** Document-order key: body position, or the footnote marker position. */
  order: number;
  /** Tie-breaker inside a footnote (offset into the note). */
  subOrder: number;
  /** 1-based footnote number for footnote threads that still exist. */
  footnoteNumber?: number;
};

export function canWriteComments(access: CommentAccess | null): boolean {
  return access === "owner" || access === "commenter" || access === "suggester";
}

/** Owner, or the thread's author while they can still write. */
export function canSetThreadStatus(
  access: CommentAccess | null,
  me: string | null,
  thread: CommentThread
): boolean {
  if (access === "owner") return true;
  return canWriteComments(access) && me != null && thread.root.author_id === me;
}

export function canEditComment(
  access: CommentAccess | null,
  me: string | null,
  row: CommentRow
): boolean {
  return canWriteComments(access) && me != null && row.author_id === me;
}

/** Rows (oldest first) → threads keyed by root. Orphan replies are dropped. */
export function groupThreads(rows: CommentRow[]): CommentThread[] {
  const threads = new Map<string, CommentThread>();
  for (const row of rows) {
    if (row.thread_id == null && isCommentAnchor(row.anchor)) {
      threads.set(row.id, {
        id: row.id,
        root: { ...row, anchor: normalizeAnchor(row.anchor) },
        replies: [],
      });
    }
  }
  for (const row of rows) {
    if (row.thread_id == null) continue;
    threads.get(row.thread_id)?.replies.push(row);
  }
  return [...threads.values()];
}

export function isOpenThread(thread: CommentThread): boolean {
  return thread.root.status === "open";
}

/**
 * Threads in document order. Unplaced threads (not resolved yet) keep
 * creation order at the end; detached threads follow attached ones.
 */
export function sortThreadsByPlacement(
  threads: CommentThread[],
  placements: Record<string, ThreadPlacement>
): CommentThread[] {
  const indexed = threads.map((thread, index) => ({ thread, index }));
  indexed.sort((a, b) => {
    const pa = placements[a.thread.id];
    const pb = placements[b.thread.id];
    const rank = (p: ThreadPlacement | undefined) =>
      !p ? 2 : p.detached ? 1 : 0;
    const ra = rank(pa);
    const rb = rank(pb);
    if (ra !== rb) return ra - rb;
    if (ra === 0 && pa && pb) {
      if (pa.order !== pb.order) return pa.order - pb.order;
      if (pa.subOrder !== pb.subOrder) return pa.subOrder - pb.subOrder;
    }
    return a.index - b.index;
  });
  return indexed.map((entry) => entry.thread);
}

export type CommentFilter = "all" | "body" | "footnotes";

export function threadMatchesFilter(
  thread: CommentThread,
  filter: CommentFilter
): boolean {
  if (filter === "all") return true;
  const scope = thread.root.anchor.scope;
  return filter === "body" ? scope === "body" : scope === "footnote";
}

const FAILURE_COPY: Record<string, string> = {
  not_found: "This essay is no longer shared with you.",
  forbidden: "You can read comments on this essay but not add them.",
  invalid_body: "Write something first (up to 5,000 characters).",
  invalid_anchor: "Select some text to comment on.",
  too_many: "This essay has reached its comment limit.",
  invalid_status: "Could not update the thread.",
};

export function commentFailureMessage(reason: string | undefined): string {
  return FAILURE_COPY[reason ?? ""] ?? "Could not save the comment.";
}

/** Initials for the avatar fallback. */
export function initialsFor(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}
