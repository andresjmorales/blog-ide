# Sharing, comments, and suggestions

Plan for letting an essay's owner invite specific people to read, comment on,
and suggest edits to a draft. Phases 1 and 2 are implemented; later phases
are the working plan.

## Principles

- **Markdown stays clean.** Comments and suggestions live in their own
  tables, never as marks or trailers in the essay body. The owner's markdown,
  GitHub backup, and exports are unaffected by review activity.
- **The owner is the only writer.** Invitees never save the document.
  Accepting a suggestion is an ordinary owner edit that goes through the
  existing save/version pipeline (so it is undoable and in Version history).
- **Vault essays cannot be shared.** They are end-to-end encrypted; the
  server cannot hand plaintext to anyone else. Refused in the database.
- **Access by link token, bound to one account.** Signup does not verify
  email ownership (`email_confirm: true`), so an email address alone is not
  proof of identity. Each invite has a 256-bit token; the first signed-in
  account whose email matches claims it, and only that account can use it
  afterwards. The owner can reset a link (new token, claim cleared) or
  remove access.
- **No presence.** No "who's viewing", cursors, or activity status.

## Access levels

| Role | Read | Comment / reply | Suggest edits |
| --- | --- | --- | --- |
| Can view (`viewer`) | ✓ | | |
| Can comment (`commenter`) | ✓ | ✓ | |
| Can suggest (`suggester`) | ✓ | ✓ | ✓ |

## Phase 1 — share links (done)

- `document_shares` table + definer RPCs (`share_document`,
  `update_document_share`, `revoke_document_share`,
  `reset_document_share_link`, `open_shared_document`,
  `list_shared_with_me`, `share_invite_allows_signup`). Migration
  `20260930180000_document_shares.sql`. Invitees never get table access to
  `documents`; the RPC checks the share, refuses vault and trashed essays,
  and returns the markdown.
- Essay ⋯ menu → **Share…** (above Essay settings) opens Essay settings on
  the new **Sharing** tab: add an email with a role, then per person: change
  role, Copy link, Email invite (opens the owner's mail app with the link
  prefilled), Reset link, Remove. Adding someone copies their link.
- `/s/<token>` — invitee view. Signed-out visitors go to login; the login
  screen offers "Create an account" that carries the invite, and a valid
  invite (token + matching email) stands in for a beta code at signup.
  Images are re-signed server-side for the invitee (only the owner's paths
  that this essay references).
- `/shared` — "Shared with me" list for the invitee.
- Essay settings: **Title** tab became **General** (title + a Versions
  shortcut into Version history; the ⋯ menu item stays).

- Invite email: when `RESEND_API_KEY` and `BLOGIDE_EMAIL_FROM` are set,
  `POST /api/share/invite` sends the invite through Resend (owner-only via
  RLS, 20 per owner per hour, reply-to is the owner, never includes essay
  text) and the Sharing tab offers "Email them an invite" when adding
  someone. Without them, "Email invite" opens the owner's mail app.

## Phase 2 — comments (done)

What shipped (migration `20260930210000_document_comments.sql`):

- `document_comments` + definer RPCs `list_document_comments`,
  `add_document_comment`, `reply_to_comment`, `edit_comment` (author),
  `delete_comment` (author; a root takes its replies), `set_thread_status`
  (owner, or the thread's author while they can still write), and
  `document_comment_participants`. Access goes through the internal
  `document_comment_access` helper: the owner, or a *claimed* share.
  **Viewers can read threads but not write.** Vault and trashed essays give
  `not_found`. 500 threads per essay, 200 replies per thread, 5,000
  characters per comment; not counted against quota.
- `lib/comments/anchors.ts` (text-quote anchors, pure), `resolveThreads.ts`,
  `highlights.ts` (the `CommentHighlights` decoration plugin),
  `useCommentHighlights.ts` (re-resolves on the `commentAnchors` lane,
  300ms), `store.ts` (one comment session per page), `surfaces.ts` (which
  editor holds the selection: body or an open footnote card).
- Invitee view (`/s/<token>`) is a read-only TipTap editor with the shared
  extension set and the real footnote node views (read-only: no drag,
  delete, or edits), a **Notes** list after the essay, a refresh button next
  to "updated …", a floating **Comment** button under a selection, and the
  rail (right on desktop, bottom sheet on phones).
- Owner: **Comments** is a dockable panel (Panels menu, or the comment count
  in the essay toolbar, which appears once the essay has threads). Threads
  are in document order with "Footnote n" chips and All · Body · Footnotes
  filters; resolved threads collapse; detached threads keep their quote and
  a "Text changed" chip. Clicking a highlight opens the panel on its thread;
  clicking a thread scrolls to its highlight or opens its footnote card.
  The owner can also start a thread on a selection ("+ Comment"). Threads
  refresh when the tab becomes visible and every 3 minutes (no realtime).
- `GET /api/comments/participants?node=` returns names and 1-hour signed
  photo URLs for participants only; initials otherwise.

### Data

```text
document_comments
  id uuid pk
  node_id uuid → workspace_nodes (cascade)
  owner_id uuid            -- essay owner (for RLS and cleanup)
  author_id uuid → auth.users
  thread_id uuid null      -- null = thread root; replies point at the root
  kind text                -- 'comment' | 'suggestion'
  anchor jsonb             -- roots only, see below
  body text                -- comment text (plain text + @-free for now)
  suggestion jsonb null    -- phase 3
  status text              -- 'open' | 'resolved' (roots); suggestions add
                           -- 'accepted' | 'rejected'
  created_at, updated_at, resolved_at, resolved_by
```

Reads and writes through definer RPCs that accept either the owner or a
claimed share with the right role (`list_document_comments(node_id)`,
`add_document_comment`, `reply_to_comment`, `edit_comment`,
`delete_comment` (author), `set_thread_status` (owner or thread author)).
Rows are small and not counted against the owner's storage quota; cap threads
per document (e.g. 500) to bound abuse.

### Anchors that survive editing

The owner keeps writing while comments are open, so anchors cannot be
ProseMirror positions or markdown offsets. Use a text-quote selector (the
W3C Web Annotation model):

```json
{
  "scope": "body" | "footnote",
  "footnoteId": "fn-…",           // when scope = footnote
  "quote": "the exact highlighted text",
  "prefix": "≈32 chars before",
  "suffix": "≈32 chars after",
  "hint": 1234                     // plain-text offset at creation, tie-breaker
}
```

Footnotes already have stable ids persisted in the markdown, so a comment on
footnote text records `scope: "footnote"` + `footnoteId` and searches only
that note's text. Resolution: exact quote match nearest `hint`, disambiguated
by prefix/suffix; if the quote is gone, fuzzy match (prefix+suffix); if that
fails the thread is **detached** — still listed, shown with its original
quote and "text changed", never silently dropped.

Resolution runs in a small pure module (`lib/comments/anchors.ts`) against
the plain text of the body and of each footnote, so it is unit-testable and
shared by the owner's editor and the invitee view.

### Rendering

A ProseMirror plugin (`CommentHighlights`) takes resolved ranges and paints
decorations — no document changes, same pattern as Find and Harper
underlines, mapped through transactions and re-resolved on the
"after typing" lane (`EDITOR_WORK_MS`). For footnotes, the same decorations
are applied inside the nested footnote editor when its card is open, and the
footnote's reference mark gets a small comment dot when a thread targets its
note.

The invitee view moves from `DocumentPreview` (HTML) to a **read-only TipTap
editor** built from the shared extension set (`editable: false`, footnote
node views, no toolbar except in suggest mode). That gives both sides the
same text model for anchors, and it is the surface suggestions need.

### UX: the comments rail

- **Owner:** a **Comments** panel in the existing dock system
  (`PersistentPanel`/`DockRegion`), so it can sit on the right like
  Outline/Cite. Toolbar gets a comment-count button that toggles it. Open
  threads are listed **in document order**; each card shows the quoted text,
  author avatar + name, time, body, replies, and a reply box. Resolved
  threads collapse under a "Resolved (n)" disclosure.
- **Invitee:** no other panels. The same rail, docked right on desktop and a
  bottom sheet on phones. Select text → a floating "Comment" button (and
  "Suggest" for suggesters) → composer in the rail.
- **Linking:** clicking a highlight scrolls the rail to its thread and
  vice-versa; the active thread's highlight darkens.
- **Footnote threads:** cards carry a "Footnote 3" chip. Clicking one opens
  that footnote's card (or scrolls to it in endnotes mode, below) and
  highlights inside it. Filter chips at the top: All · Body · Footnotes ·
  Suggestions.
- **Why a list rail rather than Google-Docs-style floating margin cards:**
  the essay column already shares its margin with the footnote sidenote
  rail. Two competing margin layouts would collide on long, footnote-heavy
  essays. A list in document order stays legible at any density and works on
  phones.

## Phase 3 — suggestions

Suggest mode for `suggester` invitees (Google Docs "Suggesting"):

- The invitee edits a **local scratch copy** in the read-only-by-default
  editor with a `SuggestMode` plugin: typed text is inserted with an
  "insertion" mark; deletions are not applied but wrapped in a "deletion"
  mark. Formatting changes (bold, italic, link, heading) are recorded as
  "format" marks. The owner's doc is never touched.
- On each pause, contiguous marked spans are packed into suggestion rows:

  ```json
  {
    "anchor": { …same text-quote selector… },
    "op": "replace",
    "from": "original text",
    "to": "replacement text",
    "toMarkdown": "replacement **with** formatting"
  }
  ```

  Storing the replacement as a markdown fragment covers formatting
  suggestions without inventing a second schema.
- The owner sees suggestions as threads with a green/red inline diff
  (reuse `WordDiffText`) and **Accept** / **Reject**. Accept resolves the
  anchor, replaces that range in the editor with the parsed fragment (one
  transaction, so Ctrl+Z undoes it), and marks the row accepted. If the
  anchor no longer resolves, Accept is disabled and the card says why.
- Suggestions inside footnotes work the same way with `scope: "footnote"`.

## Phase 4 — endnotes view and polish

- **Footnotes at the end.** New editor preference: *Footnotes: Margin rail ·
  End of essay · Both*. "End of essay" renders a **Notes** section after the
  last paragraph that scrolls with the essay (no fixed-height rail), with
  back-links to each reference. "Both" keeps the rail and adds the section
  collapsed by default ("Notes (12) ▸"). The invitee view defaults to End of
  essay on narrow screens. Comment highlights and footnote threads work in
  either layout because anchors are per-footnote, not per-layout.
- Endnotes can reuse the invitee view's Notes list (phase 2 renders one
  after the essay in the shared view).
- Unread badge for the owner: count threads with activity newer than the
  owner's last view (stored per user per document; not presence).
- Essay settings → General can host the footnote display override for one
  essay once the preference exists.

## Phase 5 — comment notifications

Invites already go through Resend when configured (`lib/email/resend.ts`).
Reuse it for "new comment / reply" digests to the owner and thread
participants: batched (at most one email per document per hour), with an
unsubscribe setting, never including essay text.

## Profile photos in threads

Photos live in the private `assets` bucket and are signed per request, so
they are **not public**. For threads, a server route returns signed avatar
URLs (service role, short TTL) only for users who are participants on a
document the caller can access (owner or claimed share). Someone who is not
on the document cannot resolve anyone's photo. Initials remain the fallback.

## Real-time co-editing (not planned)

Today the owner is the single writer: IndexedDB working copy → debounced
`save_document` RPC with optimistic versions → conflict copies on a
collision. That model is deliberately single-writer. Live multi-person
editing would need:

- A CRDT document (Yjs via TipTap's Collaboration extension,
  `y-prosemirror`) as the source of truth while editing, with markdown
  becoming a derived snapshot written on idle. The byte-exact markdown
  round-trip fixtures would have to hold for markdown ⇄ Yjs too.
- A relay: Supabase Realtime broadcast (no server to run, but you manage
  persistence and compaction of Yjs updates yourself) or a Hocuspocus /
  Liveblocks-style server.
- Reworking the offline queue and conflict copies around CRDT merges, and
  the footnote atoms (nested editors) as Yjs subdocuments or XML fragments.
- Vault essays would need encrypted update streams.

That is a multi-week project that touches the persistence core. Comments and
suggestions (above) give most of the review value without it, and nothing in
phases 2–4 blocks adopting Yjs later.
