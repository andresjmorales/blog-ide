export type WorkspaceKind = "folder" | "document" | "link";
export type ConflictResolution = "keep_cloud" | "use_mine" | "keep_both";

export type WorkspaceNode = {
  id: string;
  user_id: string;
  parent_id: string | null;
  kind: WorkspaceKind;
  name: string;
  position: number;
  url: string | null;
  pinned: boolean;
  /** Reserved system folders ("trash" | "inbox") or seeded scratchpad identity. */
  system_key: string | null;
  /** Optional accent color (CSS color string) shown in the Files explorer. */
  color: string | null;
  conflict_of?: string | null;
  conflict_base_version?: number | null;
  conflict_key?: string | null;
  conflict_created_at?: string | null;
  conflict_resolved_at?: string | null;
  conflict_resolution?: ConflictResolution | null;
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
  scratchpadId?: string | null;
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

export type CreateDocumentConflictCopyResult =
  | { ok: true; copyId: string; created: boolean }
  | { ok: false; reason: "invalid_input" | "not_found" | "quota" | string };

export type ResolveDocumentConflictResult =
  | {
      ok: true;
      copyId: string;
      originId: string;
      resolution: ConflictResolution;
      version: number;
      sizeBytes?: number;
    }
  | {
      ok: false;
      reason:
        | "invalid_resolution"
        | "expected_version_required"
        | "not_found"
        | "not_conflict_copy"
        | "already_resolved"
        | "origin_not_found"
        | "trash_unavailable"
        | "conflict"
        | "quota"
        | string;
      copyId?: string;
      remoteVersion?: number;
      remoteMarkdown?: string;
    };
