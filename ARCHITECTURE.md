# BlogIDE Architecture

BlogIDE is a local-first, markdown-native writing workspace. The editor should
feel like a document editor while every essay remains portable standard
markdown.

## System boundaries

### Browser

- Next.js/React application shell and TipTap editor.
- IndexedDB working copy and offline sync queue.
- Local-only API keys (Anthropic / OpenAI) and optional future GitHub PAT.
- Immediate editing, source-mode switching, footnotes, pins/previews, and export.

### Supabase

- Auth and beta-code-gated signup.
- Postgres source of truth for the workspace tree, markdown documents,
  metadata, user settings, optimistic versions, and quota accounting.
- Server-side revision history: every save snapshots the replaced version
  (last 20 per document), restorable via `restore_document_revision`.
- Storage bucket for images (objects are world-readable by URL so embedded
  images work in exported/published essays; paths are user-scoped and
  uploads are capped and image-only).
- Row-level security on every user-owned table and object path. Writes that
  carry invariants (document versions, quota counters, tree structure) are
  revoked for direct table access and must go through definer RPCs.

### Next.js server

- Beta-code redemption using the server-only Supabase service-role key.
- SSRF-hardened link metadata and reader extract (`/api/link-preview`,
  `/api/reader`).
- Thin AI chat proxy (`/api/ai/chat`) — the user’s key is sent per request and
  not stored server-side.
- Optional Pandoc export where a deployment enables it (not required).

### Optional external services

- GitHub is intended as a one-way backup/export target, not required
  onboarding and not overflow media storage.
- Anthropic / OpenAI are called with the user’s own key via the proxy above.

## Persistence model

Supabase is the durable cloud source of truth. IndexedDB is the per-device
working layer:

1. Editor transactions serialize to markdown and save locally.
2. The sync engine writes documents to Supabase using optimistic versions.
3. A clean client fast-forwards when a newer remote version exists.
4. Concurrent dirty edits create a conflict-copy document rather than losing
   either version.
5. Dirty local copies open without a network round trip, and a clean local
   copy still opens when Supabase is unreachable (offline).
6. Local writes and their sync-queue entries commit in single IndexedDB
   transactions, so a keystroke racing a sync can neither be lost nor
   resurrect a stale base version.
7. Blur, tab-hide, doc switch, and unmount flush the debounced draft to
   IndexedDB immediately before pushing the queue.

Each user has a hard combined quota (default **20 MiB** on the free hosted
tier) across UTF-8 markdown bytes and binary Storage objects. Authoritative
accounting must happen in transactional database/server operations, never in
client-provided counters. Paid hosted plans may raise `quota_bytes` per user
later.

## Workspace model

The explorer is a tree of stable UUID-backed nodes:

- `folder` contains and orders child nodes;
- `document` points to a markdown body;
- `link` stores research URLs and metadata.

Paths are presentation, not identity: moving or renaming a document does not
change its ID.

## Markdown boundary

The shared extension set in `lib/editor/extensions.ts` powers both the editor
and the headless pipeline. Frontmatter is held and re-emitted verbatim.
Footnote bodies live inside inline TipTap atoms and serialize to ordered GFM
references plus definitions.

CI enforces byte-for-byte fixture round trips. New syntax does not ship until
it survives that test.

## Repository map

```text
app/                  Routes, metadata, API handlers, and global styles
components/           App shell and interactive editor components
lib/editor/           TipTap extensions and editor commands
lib/markdown/         Parse/serialize and frontmatter pipeline
lib/db/               IndexedDB working copy
lib/sync/             Autosave / Supabase sync engine
lib/workspace/        Workspace tree + document RPC clients
lib/supabase/         Browser, server, and service-role clients
lib/pins/             Floating pin / pop-out session store
lib/preview/          Publication HTML, SSRF helpers, OG helpers
supabase/schema.sql   Database bootstrap, RLS, and RPCs
supabase/migrations/  Timestamped copies for db push workflows
tests/                Round-trip and focused behavior tests
```
