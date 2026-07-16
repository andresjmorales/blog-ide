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
  /** Reserved system folders, e.g. "trash". */
  system_key: string | null;
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
