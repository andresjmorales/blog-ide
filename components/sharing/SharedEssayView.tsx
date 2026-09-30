"use client";

import Link from "next/link";
import { DocumentPreview } from "@/components/DocumentPreview";
import { SHARE_ROLE_LABELS, type ShareRole } from "@/lib/sharing/types";

type Props = {
  markdown: string;
  role: ShareRole;
  ownerName: string | null;
  updatedAt: string | null;
};

/**
 * Invitee view of a shared essay: the reading layout plus a slim header.
 * Read-only for now; comments and suggestions build on this surface.
 */
export function SharedEssayView({ markdown, role, ownerName, updatedAt }: Props) {
  const updated = updatedAt
    ? new Date(updatedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 text-sm">
        <Link href="/shared" className="font-semibold hover:text-accent">
          BlogIDE
        </Link>
        <span className="text-muted">
          Shared by {ownerName || "the author"}
          {updated ? ` · updated ${updated}` : ""}
        </span>
        <span className="ml-auto rounded border border-border px-2 py-0.5 text-xs text-muted">
          {SHARE_ROLE_LABELS[role]}
        </span>
      </header>
      <DocumentPreview markdown={markdown} />
    </div>
  );
}
