"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReadOnlyEssay } from "@/components/comments/ReadOnlyEssay";
import { CommentsRail, RefreshGlyph } from "@/components/comments/CommentsRail";
import {
  CommentGlyph,
  SelectionCommentButton,
} from "@/components/comments/SelectionCommentButton";
import {
  clearCommentSession,
  getCommentSession,
  loadComments,
  refreshComments,
  subscribeCommentSession,
  useCommentSession,
} from "@/lib/comments/store";
import { canWriteComments } from "@/lib/comments/types";
import { splitFrontmatter } from "@/lib/markdown/frontmatter";
import { fileNameToTitle, parseTitle } from "@/lib/markdown/titleFrontmatter";
import { SHARE_ROLE_LABELS, type ShareRole } from "@/lib/sharing/types";

type Props = {
  nodeId: string;
  name: string;
  markdown: string;
  role: ShareRole;
  ownerName: string | null;
  updatedAt: string | null;
};

const PHONE_QUERY = "(max-width: 767px)";

/**
 * Invitee view of a shared essay: the owner's text in a read-only editor
 * (same schema, so comment anchors line up), a slim header with refresh,
 * and the comments rail (right on desktop, a bottom sheet on phones).
 */
export function SharedEssayView({
  nodeId,
  name,
  markdown,
  role,
  ownerName,
  updatedAt,
}: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [phone, setPhone] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const session = useCommentSession();

  const { title, body } = useMemo(() => {
    const split = splitFrontmatter(markdown);
    return {
      title: parseTitle(split.frontmatter) || fileNameToTitle(name),
      body: split.body,
    };
  }, [markdown, name]);

  useEffect(() => {
    const media = window.matchMedia(PHONE_QUERY);
    const sync = () => setPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    void loadComments(nodeId);
    return () => clearCommentSession();
  }, [nodeId]);

  // New replies from the owner show up when the reader comes back.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void refreshComments();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // On phones, picking a thread from its highlight opens the sheet.
  useEffect(() => {
    if (!phone) return;
    let last = getCommentSession().activeThreadId;
    return subscribeCommentSession(() => {
      const next = getCommentSession().activeThreadId;
      if (next && next !== last) setSheetOpen(true);
      last = next;
    });
  }, [phone]);

  const refresh = useCallback(() => {
    startRefresh(() => {
      router.refresh();
    });
    void refreshComments();
  }, [router]);

  const updated = updatedAt
    ? new Date(updatedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const openCount = session.threads.filter((t) => t.root.status === "open").length;
  const writable = canWriteComments(session.access ?? role);

  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 text-sm">
        <Link href="/shared" className="font-semibold hover:text-accent">
          BlogIDE
        </Link>
        <span className="inline-flex items-center gap-1.5 text-muted">
          Shared by {ownerName || "the author"}
          {updated ? ` · updated ${updated}` : ""}
          <button
            type="button"
            className="comment-icon-btn"
            title="Get the latest version"
            aria-label="Get the latest version"
            disabled={refreshing}
            onClick={refresh}
          >
            <RefreshGlyph spinning={refreshing} />
          </button>
        </span>
        <span className="ml-auto rounded border border-border px-2 py-0.5 text-xs text-muted">
          {SHARE_ROLE_LABELS[role]}
        </span>
        {phone && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs"
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen((open) => !open)}
          >
            <CommentGlyph />
            {openCount}
          </button>
        )}
      </header>
      <div className="flex min-h-0 flex-1">
        <div
          className="min-h-0 min-w-0 flex-1 overflow-y-auto"
          data-blogide-editor-scroll=""
        >
          <article className="mx-auto max-w-2xl px-6 py-10">
            <h1 className="shared-essay-title">{title}</h1>
            <ReadOnlyEssay body={body} commentsEnabled />
          </article>
        </div>
        {!phone && (
          <aside className="shared-comments-aside">
            <CommentsRail variant="invitee" />
          </aside>
        )}
      </div>
      {phone && sheetOpen && (
        <div className="shared-comments-sheet" role="dialog" aria-label="Comments">
          <CommentsRail variant="invitee" onClose={() => setSheetOpen(false)} />
        </div>
      )}
      {writable && (
        <SelectionCommentButton onStart={() => phone && setSheetOpen(true)} />
      )}
    </div>
  );
}
