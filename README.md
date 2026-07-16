# BlogIDE

An IDE for essays — a browser-based writing environment for long-form writing with first-class footnotes, a project-explorer-style knowledge workspace, autosave, and an AI assistant sidebar. Markdown-native, local-first, MIT licensed, self-hostable by design.

Full design: [`.local/blogide-spec.md`](./.local/blogide-spec.md).

## Status

Milestone 2 of 6 (see spec §13):

- **M1 — Shell & auth**: Supabase auth with beta-code gate, settings storage, three-panel layout, PWA manifest.
- **M2 — Editor & round-trip**: TipTap editor with the full §5.1 node set, bidirectional markdown serialization, source-view toggle with lossy-parse warning, round-trip fixture test suite.
- **M4 — Footnotes**: first-class inline references, nested footnote editor, GFM serialization, and sidenote view. Implemented before persistence.

Documents remain in-memory until the revised M3. Images, persistence, and the AI sidebar land in later milestones.

## Stack

Next.js, TypeScript, Tailwind CSS, TipTap, Supabase, and IndexedDB. GitHub
backup and the Anthropic assistant are optional integrations. See
[ARCHITECTURE.md](./ARCHITECTURE.md) for boundaries, persistence, quota, and
the repository map.

## Getting started

### 1. Create / open a Supabase project

Use any Supabase project you control (hosted or self-hosted).

1. In the Supabase dashboard **SQL Editor**, run [`supabase/schema.sql`](./supabase/schema.sql).
2. Seed a beta access code (pick any string you want):

```sql
insert into beta_codes (code) values ('YOUR-CODE-HERE');
```

You can insert more codes the same way. Codes are single-use: once redeemed at signup they are marked with `redeemed_by` / `redeemed_at`.
3. Under **Project Settings → API**, copy:
   - Project URL
   - legacy `anon` / `public` key
   - legacy `service_role` key (server-only — never put this in client code or commit it)
4. Under **Authentication → URL Configuration**, set the Site URL to
   `http://localhost:3000` for local work. Add your production URL before deploying.

### 2. Configure the environment

```bash
cp .env.example .env.local
```

Edit `.env.local` (this file is gitignored — keep secrets here, not in the README):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` is used only by the signup API route to redeem beta codes. Never expose it to the browser.

Add the same three variables in Vercel (or your host) when deploying.

### 3. Run

```bash
npm install
npm run dev
```

Open http://localhost:3000 → **Sign up** → enter your beta code from step 1 → create an account.

```bash
npm test   # round-trip suite (spec §5.1)
```

> Without real Supabase credentials (fresh clone / placeholder values in `.env.local`), the app runs in an unauthenticated **preview mode**: auth is skipped and `/editor` shows the shell directly.

## Security notes

See [SECURITY.md](./SECURITY.md). Setup, testing, and pull-request guidance
live in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Support

If BlogIDE is useful, you can support development through
[Buy Me a Coffee](https://buymeacoffee.com/andresjmorales).

## License

MIT — see [LICENSE](./LICENSE).
