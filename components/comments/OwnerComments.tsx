"use client";

import { CommentsRail } from "@/components/comments/CommentsRail";
import { CommentGlyph } from "@/components/comments/SelectionCommentButton";
import { createAnchor } from "@/lib/comments/anchors";
import { requestCommentsPanel } from "@/lib/comments/panelBridge";
import { startCommentDraft, useCommentSession } from "@/lib/comments/store";
import {
  anchorForSelection,
  currentCommentSelection,
} from "@/lib/comments/surfaces";
import { getEssayEditor } from "@/lib/citations/essayEditor";
import { showToast } from "@/lib/ui/toast";

/** Owner: start a thread on whatever is selected in the essay or a footnote. */
function commentOnSelection() {
  const target = currentCommentSelection();
  let anchor = target ? anchorForSelection(target) : null;
  if (!anchor) {
    const editor = getEssayEditor();
    const selection = editor?.state.selection;
    if (editor && selection && !selection.empty) {
      anchor = createAnchor(editor.state.doc, selection.from, selection.to);
    }
  }
  if (!anchor) {
    showToast("Select some text in the essay first.");
    return;
  }
  startCommentDraft(anchor);
}

/** The owner's Comments dock panel (and phone sheet). */
export function OwnerCommentsPanel({ onClose }: { onClose?: () => void }) {
  return (
    <CommentsRail
      variant="owner"
      onClose={onClose}
      onCommentOnSelection={commentOnSelection}
    />
  );
}

/** Toolbar count of open threads; hidden until the essay has any. */
export function CommentsToolbarButton({ nodeId }: { nodeId: string | null }) {
  const session = useCommentSession();
  if (!nodeId || session.nodeId !== nodeId || session.threads.length === 0) {
    return null;
  }
  const open = session.threads.filter((t) => t.root.status === "open").length;
  return (
    <button
      type="button"
      className="blogide-chrome-btn comments-toolbar-btn"
      title={`${open} open comment${open === 1 ? "" : "s"} · show or hide Comments`}
      aria-label={`Comments: ${open} open`}
      onClick={() => requestCommentsPanel("toggle")}
    >
      <CommentGlyph />
      {open}
    </button>
  );
}
