export type WorkspaceKind = "folder" | "document" | "link";

export type WorkspaceNode = {
  id: string;
  user_id: string;
  parent_id: string | null;
  kind: WorkspaceKind;
  name: string;
  position: number;
  url: string | null;
  pinned: boolean;
  /** Reserved system folders, e.g. "trash" | "inbox". */
  system_key: string | null;
  /** Optional accent color (CSS color string) shown in the Files explorer. */
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type RemoteDocument = {
  node_id: string;
  user_id: string;
  markdown: string;
  status: string | null;
  version: number;
  size_bytes: number;
  updated_at: string;
};

export type DefaultWorkspaceIds = {
  essaysId: string;
  draftsId: string;
  scratchpadId: string;
  inboxId?: string;
  notesChannelId?: string;
  trashId?: string;
};

export type SaveDocumentResult =
  | { ok: true; version: number; sizeBytes: number }
  | {
      ok: false;
      reason: "conflict" | "not_found" | "quota" | string;
      remoteVersion?: number;
      remoteMarkdown?: string;
    };
