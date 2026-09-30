"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  cancelCommentDraft,
  refreshComments,
  setActiveThread,
  submitDelete,
  submitDraft,
  submitEdit,
  submitReply,
  submitThreadStatus,
  useCommentSession,
  type CommentSession,
} from "@/lib/comments/store";
import {
  canEditComment,
  canSetThreadStatus,
  canWriteComments,
  initialsFor,
  sortThreadsByPlacement,
  threadMatchesFilter,
  type CommentFilter,
  type CommentRow,
  type CommentThread,
} from "@/lib/comments/types";

type Props = {
  variant: "owner" | "invitee";
  /** Header close button (phone sheet, dock panel). */
  onClose?: () => void;
  /** Owner: start a comment on the current editor selection. */
  onCommentOnSelection?: () => void;
  className?: string;
};

const FILTERS: { id: CommentFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "body", label: "Body" },
  { id: "footnotes", label: "Footnotes" },
];

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

function Avatar({ session, userId, name }: { session: CommentSession; userId: string; name: string | null }) {
  const person = session.participants[userId];
  const label = person?.name ?? name;
  if (person?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.avatarUrl}
        alt=""
        className="comment-avatar"
        width={24}
        height={24}
      />
    );
  }
  return (
    <span className="comment-avatar comment-avatar-initials" aria-hidden>
      {initialsFor(label)}
    </span>
  );
}

function Composer({
  placeholder,
  submitLabel,
  initial = "",
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  initial?: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  async function submit() {
    const body = value.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await onSubmit(body);
    setBusy(false);
    if (outcome.ok) setValue("");
    else setError(outcome.message);
  }

  return (
    <div className="comment-composer" onClick={(event) => event.stopPropagation()}>
      <textarea
        ref={ref}
        value={value}
        rows={2}
        maxLength={5000}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          } else if (event.key === "Escape" && onCancel) {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      {error && <p className="comment-error" role="alert">{error}</p>}
      <div className="comment-composer-actions">
        {onCancel && (
          <button type="button" className="comment-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="comment-btn is-primary"
          disabled={!value.trim() || busy}
          onClick={() => void submit()}
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

function CommentBody({
  session,
  row,
}: {
  session: CommentSession;
  row: CommentRow;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mine = canEditComment(session.access, session.me, row);
  const edited = row.updated_at !== row.created_at && row.thread_id != null;

  return (
    <div className="comment-row">
      <div className="comment-meta">
        <Avatar session={session} userId={row.author_id} name={row.author_name} />
        <span className="comment-author">
          {session.participants[row.author_id]?.name ?? row.author_name ?? "Someone"}
        </span>
        <span className="comment-when">{formatWhen(row.created_at)}</span>
        {edited && <span className="comment-when">· edited</span>}
      </div>
      {editing ? (
        <Composer
          initial={row.body}
          placeholder="Edit comment"
          submitLabel="Save"
          autoFocus
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => {
            const outcome = await submitEdit(row.id, body);
            if (outcome.ok) setEditing(false);
            return outcome;
          }}
        />
      ) : (
        <p className="comment-text">{row.body}</p>
      )}
      {mine && !editing && (
        <div className="comment-row-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="comment-link" onClick={() => setEditing(true)}>
            Edit
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                className="comment-link is-danger"
                onClick={() => void submitDelete(row.id)}
              >
                {row.thread_id == null ? "Delete thread" : "Delete"}
              </button>
              <button type="button" className="comment-link" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className="comment-link" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ThreadCard({
  session,
  thread,
}: {
  session: CommentSession;
  thread: CommentThread;
}) {
  const active = session.activeThreadId === thread.id;
  const placement = session.placements[thread.id];
  const anchor = thread.root.anchor;
  const resolved = thread.root.status !== "open";
  const cardRef = useRef<HTMLDivElement>(null);
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    if (active) cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const chip =
    anchor.scope === "footnote"
      ? placement?.footnoteNumber
        ? `Footnote ${placement.footnoteNumber}`
        : "Footnote"
      : null;

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      data-thread-id={thread.id}
      className={`comment-thread${active ? " is-active" : ""}${resolved ? " is-resolved" : ""}`}
      onClick={() => setActiveThread(thread.id, true)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setActiveThread(thread.id, true);
        }
      }}
    >
      <div className="comment-quote-row">
        {chip && <span className="comment-chip">{chip}</span>}
        {placement?.detached && (
          <span className="comment-chip is-warning" title="The quoted text was changed or removed">
            Text changed
          </span>
        )}
      </div>
      <blockquote className={`comment-quote${placement?.detached ? " is-detached" : ""}`}>
        {anchor.quote.length > 240 ? `${anchor.quote.slice(0, 237)}…` : anchor.quote}
      </blockquote>
      <CommentBody session={session} row={thread.root} />
      {thread.replies.map((reply) => (
        <CommentBody key={reply.id} session={session} row={reply} />
      ))}
      <div className="comment-thread-actions" onClick={(event) => event.stopPropagation()}>
        {canWriteComments(session.access) && !resolved && !replying && (
          <button type="button" className="comment-link" onClick={() => setReplying(true)}>
            Reply
          </button>
        )}
        {canSetThreadStatus(session.access, session.me, thread) && (
          <button
            type="button"
            className="comment-link"
            onClick={() =>
              void submitThreadStatus(thread.id, resolved ? "open" : "resolved")
            }
          >
            {resolved ? "Reopen" : "Resolve"}
          </button>
        )}
      </div>
      {replying && (
        <Composer
          placeholder="Reply"
          submitLabel="Reply"
          autoFocus
          onCancel={() => setReplying(false)}
          onSubmit={async (body) => {
            const outcome = await submitReply(thread.id, body);
            if (outcome.ok) setReplying(false);
            return outcome;
          }}
        />
      )}
    </div>
  );
}

/**
 * Comment threads for the essay in the current comment session: the
 * owner's dock panel and the invitee's right rail / phone sheet.
 */
export function CommentsRail({ variant, onClose, onCommentOnSelection, className = "" }: Props) {
  const session = useCommentSession();
  const [filter, setFilter] = useState<CommentFilter>("all");
  const [showResolved, setShowResolved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const ordered = useMemo(
    () => sortThreadsByPlacement(session.threads, session.placements),
    [session.threads, session.placements]
  );
  const visible = ordered.filter((thread) => threadMatchesFilter(thread, filter));
  const open = visible.filter((thread) => thread.root.status === "open");
  const resolved = visible.filter((thread) => thread.root.status !== "open");
  const openCount = session.threads.filter((t) => t.root.status === "open").length;
  const writable = canWriteComments(session.access);

  // Clicking a resolved thread's highlight is impossible (not painted), but
  // the owner may pick one from a link; expand so it is visible.
  const activeResolved = resolved.some((t) => t.id === session.activeThreadId);

  return (
    <div className={`comments-rail ${className}`} aria-label="Comments">
      <div className="comments-rail-header">
        <span className="comments-rail-title">
          Comments{openCount > 0 ? ` (${openCount})` : ""}
        </span>
        <button
          type="button"
          className="comment-icon-btn"
          title="Check for new comments"
          aria-label="Check for new comments"
          disabled={refreshing || !session.nodeId}
          onClick={async () => {
            setRefreshing(true);
            await refreshComments();
            setRefreshing(false);
          }}
        >
          <RefreshGlyph spinning={refreshing} />
        </button>
        {onClose && (
          <button
            type="button"
            className="comment-icon-btn"
            aria-label="Close comments"
            title="Close"
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>

      <div className="comments-rail-filters" role="group" aria-label="Filter comments">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`comment-filter${filter === item.id ? " is-on" : ""}`}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
        {variant === "owner" && writable && onCommentOnSelection && (
          <button
            type="button"
            className="comment-filter ml-auto"
            title="Comment on the text selected in the essay"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onCommentOnSelection}
          >
            + Comment
          </button>
        )}
      </div>

      <div className="comments-rail-scroll">
        {session.error && (
          <p className="comment-error" role="status">{session.error}</p>
        )}

        {session.draft && (
          <div className="comment-thread is-draft">
            <div className="comment-quote-row">
              {session.draft.anchor.scope === "footnote" && (
                <span className="comment-chip">Footnote</span>
              )}
            </div>
            <blockquote className="comment-quote">
              {session.draft.anchor.quote.length > 240
                ? `${session.draft.anchor.quote.slice(0, 237)}…`
                : session.draft.anchor.quote}
            </blockquote>
            <Composer
              placeholder="Add a comment"
              submitLabel="Comment"
              autoFocus
              onCancel={cancelCommentDraft}
              onSubmit={submitDraft}
            />
          </div>
        )}

        {session.status === "idle" && (
          <p className="comments-rail-empty">
            Comments on shared essays appear here. Vault essays can&apos;t be shared.
          </p>
        )}

        {session.status === "loading" && session.threads.length === 0 && (
          <p className="comments-rail-empty">Loading comments…</p>
        )}

        {session.status === "ready" && session.threads.length === 0 && !session.draft && (
          <p className="comments-rail-empty">
            {variant === "owner"
              ? "No comments yet. People you share this essay with (⋯ → Share…) can comment on its text and footnotes."
              : writable
                ? "Select text in the essay or a footnote, then choose Comment."
                : "No comments yet."}
          </p>
        )}

        {variant === "invitee" && session.access === "viewer" && (
          <p className="comments-rail-note">You can read comments but not add them.</p>
        )}

        {open.map((thread) => (
          <ThreadCard key={thread.id} session={session} thread={thread} />
        ))}

        {resolved.length > 0 && (
          <div className="comments-resolved">
            <button
              type="button"
              className="comments-resolved-toggle"
              aria-expanded={showResolved || activeResolved}
              onClick={() => setShowResolved((value) => !value)}
            >
              {showResolved || activeResolved ? "▾" : "▸"} Resolved ({resolved.length})
            </button>
            {(showResolved || activeResolved) &&
              resolved.map((thread) => (
                <ThreadCard key={thread.id} session={session} thread={thread} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RefreshGlyph({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={spinning ? "animate-spin" : undefined}
    >
      <path
        d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export { RefreshGlyph };
