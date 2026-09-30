import { getPublicSiteUrl } from "@/lib/siteUrl";

/**
 * Share roles, least to most access. Everyone can read; commenters add
 * threads; suggesters also propose Docs-style edits the owner accepts.
 */
export const SHARE_ROLES = ["viewer", "commenter", "suggester"] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];

export const SHARE_ROLE_LABELS: Record<ShareRole, string> = {
  viewer: "Can view",
  commenter: "Can comment",
  suggester: "Can suggest",
};

export function isShareRole(value: unknown): value is ShareRole {
  return (
    typeof value === "string" &&
    (SHARE_ROLES as readonly string[]).includes(value)
  );
}

export type DocumentShare = {
  id: string;
  node_id: string;
  grantee_email: string;
  grantee_id: string | null;
  role: ShareRole;
  token: string;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
};

export type SharedWithMe = {
  share_id: string;
  token: string;
  node_id: string;
  role: ShareRole;
  name: string;
  owner_name: string | null;
  updated_at: string | null;
  last_opened_at: string | null;
};

export type OpenSharedDocumentResult =
  | {
      ok: true;
      share_id: string;
      node_id: string;
      role: ShareRole;
      name: string;
      markdown: string;
      version: number;
      updated_at: string | null;
      owner_id: string;
      owner_name: string | null;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "owner"
        | "wrong_account"
        | "claimed"
        | "unavailable";
      node_id?: string;
      invited_email?: string;
    };

export type ShareFailureReason =
  | "invalid_role"
  | "invalid_email"
  | "not_found"
  | "vault"
  | "trashed"
  | "self"
  | "too_many";

const SHARE_FAILURE_COPY: Record<ShareFailureReason, string> = {
  invalid_role: "Pick an access level.",
  invalid_email: "Enter a full email address.",
  not_found: "This essay isn't synced yet. Try again in a moment.",
  vault: "Vault essays are end-to-end encrypted and can't be shared.",
  trashed: "Restore this essay from Trash before sharing it.",
  self: "That's your own email.",
  too_many: "An essay can be shared with up to 50 people.",
};

export function shareFailureMessage(reason: string | undefined): string {
  return (
    SHARE_FAILURE_COPY[reason as ShareFailureReason] ??
    "Could not update sharing."
  );
}

/** Loose client check; the server enforces the same shape. */
export function normalizeShareEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

/** Persistent per-person link. The token is the secret, not the email. */
export function shareLink(token: string, origin = getPublicSiteUrl()): string {
  return `${origin.replace(/\/$/, "")}/s/${encodeURIComponent(token)}`;
}

/**
 * Invite through the sender's own mail app. BlogIDE does not send mail
 * itself yet (no transactional email provider is configured).
 */
export function shareInviteMailto(input: {
  email: string;
  title: string;
  link: string;
  role: ShareRole;
  senderName?: string | null;
}): string {
  const verb =
    input.role === "viewer"
      ? "read"
      : input.role === "commenter"
        ? "read and comment on"
        : "read, comment on, and suggest edits to";
  const who = input.senderName?.trim() || "I";
  const subject = `Draft: ${input.title}`;
  const body = [
    `${who === "I" ? "I'd" : `${who} would`} like you to ${verb} “${input.title}”.`,
    "",
    input.link,
    "",
    `Sign in to BlogIDE with ${input.email} to open it. If you don't have an account yet, the link lets you create one.`,
  ].join("\n");
  return `mailto:${encodeURIComponent(input.email)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}
