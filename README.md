# BlogIDE

An IDE for writing blogs and essays: a cross between a rich WYSIWYG editor and a second brain,
with first-class footnotes, autosave, a project-style workspace, and optional
AI. Markdown-native, local-first, MIT licensed, and self-hostable by design.

Full design: [`.local/blogide-spec.md`](./.local/blogide-spec.md) · Roadmap: [`.local/ROADMAP.md`](./.local/ROADMAP.md) · Preview plan: [`.local/plan.md`](./.local/plan.md).

## Status

| Milestone | State |
| --- | --- |
| **M1 — Shell & auth** | Done — Supabase auth, beta-code gate, three-panel shell, PWA, theme |
| **M2 — Editor & round-trip** | Done — TipTap §5.1 nodes, source toggle, fixture CI |
| **M3 — Persistence** | Core done — workspace tree, IndexedDB autosave, optimistic sync, Trash, 200 MB quota. Still open: Storage assets, GitHub backup, phone quick-capture |
| **M4 — Footnotes** | Done — inline notes, rail / anchored sidenotes, pin/drag cards, deleted-note archive, Substack paste repair |
| **M5 — Images & preview** | Largely done — pop-out docs, link hover/Pin, Preview tab, image compress/upload, pinned PDFs ([plan](./.local/plan.md)) |
| **M6 — AI & export** | Partial — BYOK AI sidebar + Copy/Export/Import ship now; canned actions, richer HTML, DOCX still open |

## Stack

Next.js, TypeScript, Tailwind CSS, TipTap, Supabase, and IndexedDB. GitHub
backup and the Anthropic/OpenAI assistants are optional integrations. See
[ARCHITECTURE.md](./ARCHITECTURE.md) for boundaries, persistence, quota, and
the repository map.

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
On first editor load, BlogIDE bootstraps `essays/`, `drafts/`, and pinned `scratchpad.md`. Edits save to IndexedDB immediately and sync to Supabase.

Optional: open **Account settings** to paste Anthropic or OpenAI keys for the AI sidebar (keys stay on the device; requests go through a thin proxy).

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
