# BlogIDE

An IDE for writing blogs and essays: a cross between a rich WYSIWYG editor and a
second brain, with first-class footnotes, autosave, a project-style workspace,
and optional AI. Markdown-native, local-first, MIT licensed, and self-hostable
by design.

## Features

- **WYSIWYG editor with a markdown soul** — TipTap rich text, source toggle, and
  byte-for-byte round-trip for supported constructs
- **First-class footnotes** — inline notes, sidenote rail or anchored notes,
  pin/drag cards, deleted-note archive, Substack-style paste repair
- **Workspace** — folder/document/link tree, Trash, Notes channels, scratchpad
  bootstrap, phone terminal capture + desktop Shell
- **Local-first sync** — IndexedDB autosave, optimistic Supabase sync, conflict
  copies, hard per-user quota (default 20 MiB combined)
- **Research surfaces** — pop-out documents, link hover/Pin, PDF + site-link
  Library pins (bookmark from hover or pinned preview), publication Preview in
  a new tab, pre-publish link/image check, client image compress + Storage upload
- **Optional AI** — BYOK Anthropic / OpenAI keys (device-local), sidebar chat,
  import cleanup assist
- **Export / import** — copy markdown + HTML, download `.md`, import markdown
  from the Files panel; Convert Case and Clean whitespace for messy pastes

## Stack

Next.js, TypeScript, Tailwind CSS, TipTap, Supabase, and IndexedDB. GitHub
backup and model APIs are optional. See [ARCHITECTURE.md](./ARCHITECTURE.md)
for boundaries, persistence, quota, and the repository map. Differences from
GFM (frontmatter, captions, footnotes, math/tables) are summarized in
[docs/MARKDOWN_SPEC.md](./docs/MARKDOWN_SPEC.md).

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
   `http://localhost:3000` for local work. Add your production URL (e.g. `https://blogide.com`) before deploying, plus matching Redirect URLs.

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

`SUPABASE_SERVICE_ROLE_KEY` is used only by the signup API route to redeem beta codes.

Add the same three variables in Vercel (Production + Preview as needed) and **redeploy** after saving.

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

Open http://localhost:3000 → **Sign up** → enter your beta code → create an account.  
On first editor load, BlogIDE bootstraps `essays/`, `drafts/`, pinned `scratchpad.md`, and a `Notes/` folder (default `general.md` channel; legacy `notes.md` still works). Edits save to IndexedDB immediately and sync to Supabase. On a phone, you land in a terminal-style quick-capture screen; on desktop, open **Shell** for the same Notes stream.

Optional: open **Account settings** to paste Anthropic or OpenAI keys for the AI sidebar (keys stay on the device; requests go through a thin proxy).

```bash
npm test   # round-trip + footnote/import suites
```

### Image captions

Captions use an **adjacent line** under the image (no blank line). In the rich editor, click the gray **Add caption** field under an image. Markdown looks like:

```md
![](assets/essay/cover.webp)
Lao Tzu, founder of Taoism
```

A blank line between the image and the next paragraph means “not a caption” (alt text stays on the image for accessibility and is never shown as the caption).

**Substack paste:** Substack usually inserts a blank line before the caption if one exists. Those will not become captions automatically; delete the blank line, or paste the desired caption into **Add caption**. Exported BlogIDE markdown may not map to Substack’s native caption UI when pasting back.

> Without real Supabase credentials, the app runs in an unauthenticated **preview mode**: auth is skipped and `/editor` shows the shell without cloud sync.

## Security notes

See [SECURITY.md](./SECURITY.md). Setup, testing, and pull-request guidance
live in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Support

If BlogIDE is useful, you can support development through
[Buy Me a Coffee](https://buymeacoffee.com/andresjmorales).

## License

MIT — see [LICENSE](./LICENSE).
