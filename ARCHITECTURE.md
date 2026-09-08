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
  uploads are capped and image-only). Profile photos use a fixed
  `{userId}/avatar.webp` object in the same public `assets` bucket and
  store the URL in auth `user_metadata.avatar_url` (not counted in essay
  quota inventory).
- Row-level security on every user-owned table and object path. Writes that
  carry invariants (document versions, quota counters, tree structure) are
  revoked for direct table access and must go through definer RPCs.

### Next.js server

- Beta-code redemption using the server-only Supabase service-role key.
- SSRF-hardened link metadata and reader extract (`/api/link-preview`,
  `/api/reader`).
- Thin AI chat proxy (`/api/ai/chat`) — the user’s key is sent per request and
  not stored server-side.
- Optional hosted-instance routes (`/api/billing/*`) when a shared deploy
  enables storage tiers — see [docs/HOSTED_OPERATOR.md](./docs/HOSTED_OPERATOR.md).
- Optional Pandoc export/import (`/api/export/docx`, `/api/export/pdf`,
  `/api/import/pandoc`) when `PANDOC_PATH` points at a working binary.
  PDF also needs a PDF engine (`PANDOC_PDF_ENGINE` or xelatex / WeasyPrint /
  Typst on PATH). TipTap stays the editor; markdown and clipboard HTML remain
  the happy path. Platform paste cannot create native footnotes on
  Substack or Medium — see [docs/PUBLISH_EXPORT.md](./docs/PUBLISH_EXPORT.md).

### Optional external services

- GitHub is a backup/export target (browser PAT, Git Data API).
  Folder and document maps live in `user_settings`; the token is never stored
  in Supabase. Pushes overwrite matching files and never delete extras.
  Pull is opt-in: the client fetches the mapped file (or a same-name candidate
  if the path moved), shows a diff, and only then writes the editor copy.
  Pull never creates a workspace node. Mapping badges in Files reflect whether
  the GitHub path still exists; same-name Files entries and GitHub extras
  under a mapped folder are called out so a `git mv` is not mistaken for a
  second BlogIDE essay.
  Not required onboarding and not overflow media storage.
- Anthropic / OpenAI are called with the user’s own key via the proxy above.
- Zotero is an opt-in Cite integration (off until a key is saved
  under Settings → Integrations). The browser calls `api.zotero.org`
  directly; the key stays in `localStorage` and is never written to
  Supabase. Search works with library read. Add to Zotero (BlogIDE-only
  links) needs write. Essays keep a small `<!--blogide-citations:…-->`
  snapshot of sources still used, not a mirrored library.
- fetch(bible) is an opt-in Integrations feature (off by default). The editor
  detects English references with `@gracious.tech/bible-references` and
  decorations only (no markdown rewrite). Verse HTML comes from
  `@gracious.tech/fetch-client` (Berean Standard Bible, `eng_bsb`). The pinned
  reader is `https://app.fetch.bible`; publication Preview can load
  `https://collection.fetch.bible/enhance.js`.
- Stripe only if a shared hosted deploy opts into paid storage tiers
  ([docs/HOSTED_OPERATOR.md](./docs/HOSTED_OPERATOR.md)).
- Pushbullet and ntfy are opt-in Integrations capture paths. Access tokens
  and ntfy topic names are encrypted (AES-256-GCM) and stored in
  `user_secrets`, readable only through `/api/secrets` with the signed-in
  user’s session. The encryption key is `SECRETS_ENCRYPTION_KEY` or, if
  unset, `SUPABASE_SERVICE_ROLE_KEY`. Ciphertext is not available to the
  Supabase `authenticated` role. On a new computer, sign-in hydrates the
  vault so capture keeps working. GitHub PAT and AI keys stay device-local
  for now (they are used from the browser to those APIs).
- Pushbullet: BlogIDE registers a virtual device per Notes channel and
  ingests pushes targeted at those devices. Broadcasts to all devices are
  ignored. You send from the Pushbullet app with BlogIDE closed; the next
  BlogIDE visit catch-up uses `GET /v2/pushes?modified_after=`. The cursor
  is stored on the account so a phone and a laptop share the same catch-up
  point. Browser REST goes through `/api/pb` so ad blockers that list
  `api.pushbullet.com` do not break catch-up. The live websocket is
  best-effort; polling still imports pushes.
- ntfy: one generated topic per Notes channel. Publish with HTTP POST (or
  the ntfy app). Catch-up uses `GET /{topics}/json?poll=1&since=`. On
  ntfy.sh a topic name is the password unless reserved (Pro) or you
  self-host with ACL. ntfy itself is a Go/Docker server, not a Vercel app.

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

Each user has a hard combined quota across UTF-8 markdown bytes **and** binary
Storage objects tracked in `user_assets` (essay images + Library PDFs). Default
limits live in `lib/billing/plans.ts`. `recompute_used_bytes` sums both.
Uploads call `register_user_asset` before Storage write; deletes release via
`release_asset_path`. Authoritative accounting stays in definer RPCs, never
client-provided counters. The `assets` bucket is **public-by-URL** so published
embeds work; private + signed URLs remain deferred. Shared hosted deploys may
raise per-user `quota_bytes` via optional Stripe wiring — operator notes in
[docs/HOSTED_OPERATOR.md](./docs/HOSTED_OPERATOR.md). Self-host omits billing UI,
skips beta codes at signup, and uses a large soft quota so Supabase is the
practical storage limit.

**Library vs essay images:** same Storage bucket, different `user_assets.kind`
(`essay_image` vs `library_pdf`) and `library_items` rows for research pins /
bookmarks. Essay images are referenced from markdown; Library binaries are not.

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
components/tiptap-icons/  TipTap MIT toolbar SVG icons (icons only)
lib/editor/           TipTap extensions and editor commands
lib/bible/            Opt-in fetch(bible) detection, CDN client, app bridge
lib/markdown/         Parse/serialize and frontmatter pipeline
lib/db/               IndexedDB working copy
lib/sync/             Autosave / Supabase sync engine
lib/workspace/        Workspace tree + document RPC clients
lib/supabase/         Browser, server, and service-role clients
lib/pins/             Floating pin / pop-out session store
lib/preview/          Publication HTML, SSRF helpers, OG helpers, reader extracts
lib/github/           One-way GitHub backup (PAT, maps, Git Data push)
lib/zotero/           Zotero Web API client (search + optional write) and device-local key
lib/citations/        BibTeX format, Library Cite helpers, clipboard copy
lib/ui/               Session toasts (bottom-right action outcomes)
lib/secrets/          Encrypted account vault for capture integrations
lib/pushbullet/       Optional Pushbullet → Notes channel capture
lib/ntfy/             Optional ntfy → Notes channel capture
lib/pandoc/           Optional Word export/import when PANDOC_PATH is set
lib/billing/          Public plan limits + Stripe plan application
lib/stripe/           Server Stripe client and env helpers
supabase/schema.sql   Database bootstrap, RLS, and RPCs
supabase/migrations/  Timestamped copies for db push workflows
tests/                Round-trip and focused behavior tests
```

## Editor runtime

Typing must stay snappy on long essays (thousands of words, dozens of
footnotes, Find / Harper / fetch(bible) / Cite / Outline / footnote rail
open). The contract is in `lib/editor/workSchedule.ts`.

### Lanes

| Lane | Delay | What runs |
| --- | --- | --- |
| **Hot path** (same tick as the key) | 0 | ProseMirror `apply`, incremental decoration mapping, toolbar `isActive` |
| **after typing** | 160–320ms after last key | Markdown serialize, outline/stats, Find rescan, Cite inventory |
| **after idle** | 400ms | Harper WASM lint of dirty textblocks |
| **persist** | 1s local, then 1.5s cloud | IndexedDB, then Supabase |

Constants live in `EDITOR_WORK_MS`. Use `scheduleEditorWork(id, delay, fn)`
so a second keystroke resets the timer. Flush on blur / unmount / doc switch
(DocumentEditor already flushes serialize; DocumentWorkspace flushes persist).

### What happens on each keystroke (worst case, everything open)

A letter in the essay body, not inside a footnote:

1. TipTap input rules / smart quotes (cheap, local to the caret).
2. **Footnote index plugin** — `transactionTouchesNodeType` on the changed
   span. Body typing returns false; previous index is reused (no
   `doc.descendants`).
3. **Footnote deletion tracker** — same touch check. No archival. Citation
   prune is *scheduled* (`citeInventory`), not run.
4. **Find decorations** — `DecorationSet.map` of existing marks. No rescan.
5. **Harper underlines** — map decorations; drop squiggles on the edited word.
   WASM lint is *scheduled* (`harperLint`).
6. **Bible refs** (if enabled) — remap hits; rescan only the edited text node.
   Map decorations instead of rebuilding the set.
7. **36 footnote node views** — numbers come from plugin state (`byId`).
   Nested TipTap editors exist only for *open* cards, not every mark.
   Inline sidenote HTML is not mounted while the footnote rail is on.
8. React listeners: FormattingToolbar `useEditorState` (mark actives),
   Harper/Bible hover cards (cheap if nothing is active), TableControls only
   while the caret is in a table.

**Must not run on this tick:** `serializeBody`, outline/stats walk, Find
`findInEditor`, `listEssayLinkedUrls`, `listUsedEssaySources`,
`pruneEssayCitations`, Harper `extractLintBlocks` / `linter.lint`,
IndexedDB, Supabase.

### After typing settles

| Delay | Owner | Work |
| --- | --- | --- |
| 160ms | `DocumentEditor.onUpdate` | `serializeBody` → parent `persistMarkdown` |
| 180ms | Outline | Headings + word counts (`takeOutlineSnapshot`) |
| 250ms | Find (if open) | Full `findInEditor` + replace mapped highlights |
| 320ms | Cite rail (if mounted) | Used sources. Link inventory **only while "Links in this essay" is expanded** |
| 320ms | Deletion tracker | `pruneEssayCitations` if the trailer might be stale |
| 400ms | Harper | Extract textblocks, lint dirty ones (block cache), rebuild underlines |
| 1s | `persistMarkdown` | IndexedDB `saveLocal` |
| +1.5s | sync engine | Supabase optimistic save |

Closing Find, collapsing Cite sections, or turning Harper / bible / sidenotes
off removes that lane's work.

### Worst-case traps (fixed here, do not reintroduce)

- **Cite `editor.on("transaction")`** plus `listEssayLinkedUrls` during render
  walked every text node and 36 footnote bodies on caret moves, Harper
  results, and Find highlight writes. Cite now listens to `update` only and
  debounces; links are not counted until that section is open.
- **Find `update` handler** rescanned the whole essay and dispatched highlight
  transactions on every keystroke (which retriggered Cite). Find maps marks
  while typing and rescans at 250ms.
- **`FootnoteDeletionTracker.appendTransaction`** called `pruneEssayCitations`
  (full-doc text join + `includes` for every citation) on every body edit.
  Prune is idle; archival still runs immediately when a footnote atom is
  removed.
- **Harper / Bible `DecorationSet.create` on every remap** rebuilt all marks.
  They now `map` the existing set, like Find.
- **Nested footnote editors** used to mount for every mark. They mount when
  the card opens.

### Adding a connection, panel, or decoration

Checklist for future agents:

1. **Hot path:** only incremental `Plugin.state.apply` over
   `changedRangeInNewDoc` (see Bible refs, Find, Harper map, footnote index).
   Never `doc.descendants` / `nodesBetween(0, doc.content.size)` / regex over
   the essay / `serializeBody`.
2. **Do not** subscribe to `editor.on("transaction")` to rebuild inventories.
   That fires for selection and decoration-only writes. Use `update` +
   `scheduleEditorWork`, or read plugin state.
3. **Do not** dispatch a decoration transaction from an `update` listener
   without coalescing — it re-enters every other transaction listener.
4. Prefer `DecorationSet.map` over `DecorationSet.create` while typing.
5. Cache per immutable `doc` (`WeakMap`) or keep a plugin index if the
   value is needed on the hot path (footnote numbers).
6. Gate expensive inventories on the UI that needs them (collapsed "Links
   in this essay" must not count hrefs).
7. Put new delays in `EDITOR_WORK_MS` and document them in this table.
8. Add a test that body typing does not walk footnotes / links when your
   feature is idle (see `tests/editorHotPath.test.ts`).

### Sync (after persist, not typing)

See Persistence model above. `saveLocal` and `syncDocument` never run from
the keystroke itself. Blur, tab-hide, doc switch, and unmount flush the
serialize debounce, then the IndexedDB debounce, then push the queue.
