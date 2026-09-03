# BlogIDE

An IDE for writing blogs and essays: a cross between a rich WYSIWYG editor and a
second brain, with first-class footnotes, autosave, a project-style workspace,
and optional AI. Markdown-native, local-first, MIT licensed, and self-hostable
by design.

## Features

- **WYSIWYG editor with a markdown soul** — TipTap rich text, source toggle, and
  byte-for-byte round-trip for supported constructs
- **First-class footnotes** — inline notes, sidenote rail or anchored notes,
  pin/drag cards, delete from the note popup, deleted-note archive,
  Substack-style paste repair
- **Library + Cite** — one research panel (right dock, or pop it out).
  Saved links and PDFs share a compact list with Zotero search and pasted
  BibTeX. Expand a row for cite / open / remove. PDFs open and pin; they
  are not formatted citations. Cited here is the essay’s used-sources
  list (Copy list for a bibliography). Toolbar Cite opens this panel
  (sheet on a phone).
- **Workspace** — folder/document/link tree, Trash, Notes channels, a seeded
  scratchpad you can rename or trash, phone terminal capture + desktop Shell,
  optional Pushbullet or ntfy capture into those channels (Pushbullet REST
  goes through this site so ad blockers that block api.pushbullet.com still
  allow catch-up)
- **Local-first sync** — IndexedDB autosave, optimistic Supabase sync, conflict
  copies, hard per-user quota (default 10 MiB combined)
- **Research surfaces** — pop-out documents, link hover/Pin, cloud Library
  (PDFs + site bookmarks under quota; bookmark or cite from hover/pin),
  publication Preview, pre-publish link/image check, image compress +
  Storage upload with progress, clearer errors, alt text on the selected
  figure, broken-image cards, combined quota accounting, and zip export
  that bundles owned assets
- **Optional fetch(bible)** — off until enabled under Settings → Integrations.
  Highlights English scripture references in the essay (plain text in
  markdown), hover-previews the Berean Standard Bible, and opens a pinned
  [fetch.bible](https://fetch.bible/) reader with chapter/verse search.
  Publication preview can also linkify references.
- **Optional AI** — BYOK Anthropic / OpenAI keys (device-local), sidebar chat with
  canned actions (critique / tighten / title / expand), selection context,
  streaming replies, light model picker, smarter Apply (diff / patch), and
  import cleanup assist
- **Export / import** — Copy → Rich text is the same formatted paste as
  selecting the essay and copying; Copy → Markdown copies source; Copy → HTML
  pastes publication HTML (readable plain text as fallback, not markdown).
  Prepare
  publish opens Cleanup → Publish for footnote copy formats (bracketed [1]
  markers, superscripts + Notes, or linked HTML endnotes). Pasting HTML
  cannot recreate native footnotes on other editors; Cleanup → Publish can
  copy `[1]` markers plus a helper script that runs in the Substack editor.
  Download `.md` or `.html`; PDF (print) uses the
  browser Save as PDF dialog; optional Word `.docx` and PDF via Pandoc
  (`PANDOC_PATH`, plus a PDF engine such as `xelatex`). Import markdown or
  `.docx` / `.odt` from the Files panel. Convert Case, superscript,
  subscript, inline code, and Code block live under toolbar **Aa+** (reorder
  under Settings → Editor). Clean
  whitespace (joins Shift-Enter / PDF wraps to spaces and keeps paragraph
  breaks) and punctuation normalize (Chicago/MLA dashes, smart quotes)
  handle messy pastes.
- **GitHub backup** — optional push (device-local PAT). Map a folder to a
  repo path or a document to `README.md` from Files → GitHub, or map the open
  essay under Essay settings → GitHub. Matching files are overwritten,
  extras in the repo are left alone. Pull is explicit: you review a diff and
  confirm before the editor is replaced. Mapped items show a GitHub badge
  (green if the path exists, orange with a slash if it was moved or deleted).
  If you `git mv` a mapped file outside BlogIDE, push warns instead of
  silently recreating the old path (which would duplicate it). Refreshing
  BlogIDE never imports a second essay from GitHub; if two Files entries
  share a name, they already existed in the workspace (or are a sync
  conflict copy). Supabase stays the source of truth.
- **Find / replace** — magnifying glass / Ctrl+F with soft highlights (Enter
  steps matches); sticky find-in-selection; searches footnote bodies; scrolls
  the active match into view;   regex and headings-only scope; Ω special
  characters insert into the focused field (title, subtitle, metadata,
  find/replace)
- **Cleanup** (broom) — pinnable tabbed panel: Import (fix footnotes), Text,
  Punctuation, and Publish (footnote copy formats, Substack native footnote
  helper, link/image check); Clean whitespace joins Shift-Enter /
  PDF wraps to spaces and keeps blank lines; paste collapses extra empty
  paragraphs; Convert Case, superscript, subscript, inline code, and Code
  block live under toolbar **Aa+**; Cite is separate; paste or
  drag-drop images into the essay

## Stack

Next.js, TypeScript, Tailwind CSS, TipTap, Supabase, and IndexedDB. GitHub
backup and model APIs are optional. See [ARCHITECTURE.md](./ARCHITECTURE.md)
for boundaries, persistence, quota, and the repository map. Differences from
GFM (frontmatter, captions, footnotes, math/tables) are summarized in
[docs/MARKDOWN_SPEC.md](./docs/MARKDOWN_SPEC.md). Copying HTML and Markdown,
and preparing footnotes for other editors, is covered in
[docs/PUBLISH_EXPORT.md](./docs/PUBLISH_EXPORT.md).

## Getting started

### 1. Create / open a Supabase project

Use any Supabase project you control (hosted or self-hosted).

1. In the Supabase dashboard **SQL Editor**, run the full [`supabase/schema.sql`](./supabase/schema.sql) (or the matching file under `supabase/migrations/`).  
   **Existing projects:** re-run this file after pulling schema updates — it is additive (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) and creates `workspace_nodes`, `documents`, quota columns, Trash (`system_key`), and move/delete RPCs.
2. Seed a beta access code (pick any string you want):

```sql
insert into beta_codes (code) values ('YOUR-CODE-HERE');
```

Codes are single-use: once redeemed at signup they are marked with `redeemed_by` / `redeemed_at`.
3. Under **Project Settings → API**, copy:
   - Project URL
   - **Publishable** key (or legacy `anon`) for the browser
   - **Secret** key (or legacy `service_role`) for the server only — never put this in client code or commit it
4. Under **Authentication → URL Configuration**, set the Site URL to
   `http://localhost:3000` for local work (production: `https://blogide.com`).
   Add Redirect URLs for `/auth/confirm` and `/reset/confirm` (or
   `https://your-host/**`). For reliable password reset, also update the
   **Reset password** email template — see
   [docs/HOSTED_OPERATOR.md](./docs/HOSTED_OPERATOR.md#password-reset-email).

### 2. Configure the environment

```bash
cp .env.example .env.local
```

Edit `.env.local` (gitignored — keep secrets here, not in the README):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-secret-or-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` is used by the signup API route (and beta-code
redemption when invite-only). **Self-host:** leave `NEXT_PUBLIC_HOSTED` and
`NEXT_PUBLIC_BETA_ONLY` unset — open signup, no beta field, large soft quota.
**Shared hosted / invite-only:** set both `NEXT_PUBLIC_HOSTED=true` and
`NEXT_PUBLIC_BETA_ONLY=true`, then redeploy (`NEXT_PUBLIC_*` is build-time).
Details: [docs/HOSTED_OPERATOR.md](./docs/HOSTED_OPERATOR.md).

Add the same variables in Vercel (Production + Preview as needed) and **redeploy** after saving.

### CI migrations (optional)

On every push to `main`, CI can apply new files under [`supabase/migrations/`](./supabase/migrations/) with `supabase db push` after tests pass. Add these **GitHub repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | [Account → Access Tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_PROJECT_ID` | Project Settings → General → Reference ID |
| `SUPABASE_DB_PASSWORD` | Project Settings → Database → Database password |

Without those secrets the migrate job skips (tests still run). First-time projects should still run [`supabase/schema.sql`](./supabase/schema.sql) once (or let the migration history catch up via `db push`).

### 3. Run

```bash
npm install
npm run dev
```

Open http://localhost:3000 → **Sign up** → create an account (no beta code on
self-host). On first editor load, BlogIDE bootstraps `essays/`, `drafts/`,
a pinned `scratchpad.md` (a regular essay you can rename, move, or trash), and a
`Notes/` folder (default `general.md` channel; legacy `notes.md` still works).
Edits save to IndexedDB immediately and sync to
Supabase. On a phone, you land in a terminal-style quick-capture screen; on
desktop, open **Shell** for the same Notes stream. Optional: Settings →
Integrations for Pushbullet or ntfy capture into Notes channels. Those tokens
are encrypted on your account (paste them in Settings, never in a chat).

Optional: open **Account settings** to set a profile photo, display name, a
GitHub backup repo (PAT stays on the device), or paste Anthropic / OpenAI keys
for the AI sidebar (keys stay on the device; requests go through a thin proxy).

Self-host Word export/import (and optional Pandoc PDF) by installing Pandoc
and setting `PANDOC_PATH` (for example `/usr/bin/pandoc`) in `.env.local`.
PDF also needs a PDF engine (`PANDOC_PDF_ENGINE=xelatex`, or WeasyPrint /
Typst on PATH). Export → PDF (print) works without Pandoc. Details:
[docs/PUBLISH_EXPORT.md](./docs/PUBLISH_EXPORT.md).

```bash
npm test   # round-trip + footnote/import suites
```

> Without real Supabase credentials, the app runs in an unauthenticated **preview mode**: auth is skipped and `/editor` shows the shell without cloud sync.

## Security notes

See [SECURITY.md](./SECURITY.md). Setup, testing, and pull-request guidance
live in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Support

If BlogIDE is useful, you can support development through
[Buy Me a Coffee](https://buymeacoffee.com/andresjmorales).

## License

MIT — see [LICENSE](./LICENSE).
