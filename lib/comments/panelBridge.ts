/** Toolbar comment count / highlight click → the shell's Comments panel. */

export const COMMENTS_PANEL_EVENT = "blogide-comments-panel";

export type CommentsPanelRequest = "toggle" | "show";

export function requestCommentsPanel(action: CommentsPanelRequest): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CommentsPanelRequest>(COMMENTS_PANEL_EVENT, { detail: action })
  );
}
