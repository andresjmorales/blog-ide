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

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase Postgres — auth, workspace tree, markdown documents, settings, and quota accounting *(milestone 3)*
- Supabase Storage — binary assets in private per-user paths *(milestone 3)*
- IndexedDB — instant local autosave layer *(milestone 3)*
- GitHub — optional one-way backup/export; never required for onboarding
- Anthropic API, bring-your-own-key — AI sidebar *(milestone 6)*

## Getting started

### 1. Create a Supabase project

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run [`supabase/schema.sql`](./supabase/schema.sql). This creates `beta_codes`, `user_settings`, and `doc_index` with row-level security.
3. Seed at least one beta code:

```sql
insert into beta_codes (code) values ('YOUR-CODE-HERE');
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in from your Supabase project's API settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; used exclusively by the signup route to redeem beta codes. Never exposed to the client.

### 3. Run

```bash
npm install
npm run dev
```

Run the round-trip test suite (spec §5.1 — every editor feature must survive
`serialize(parse(fixture)) === fixture`):

```bash
npm test
```

Open http://localhost:3000, enter your beta code, and sign up.

> Without real Supabase credentials (fresh clone / placeholder values), the app runs in an unauthenticated **preview mode**: auth is skipped and `/editor` shows the shell directly, so you can explore the layout before setting anything up.

## Security notes

- The optional GitHub PAT and Anthropic API key (later milestones) are stored client-side only (IndexedDB, per device) and never sent to the server or Supabase. For the v1 single-user threat model they are stored unencrypted; a WebCrypto passphrase option is a planned nice-to-have (spec §8).
- Each user has a hard 200 MB combined quota across markdown content and Supabase Storage assets. Authoritative usage accounting will be enforced server-side in M3.
- `beta_codes` has no client RLS policies — redemption only happens through the server signup route with the service-role key.
- All other tables enforce `user_id = auth.uid()` row-level security.

## Self-hosting

BlogIDE is a standard Next.js app; the hosted instance is just a deployment of this repo.

```bash
npm run build
npm start
```

Deploy to Vercel or any Node host. Supply the three environment variables above. A `docker-compose` example is planned alongside later milestones.

## Project layout

```
app/                # routes: landing, login, signup, editor, API
components/         # client components (forms, app shell, editor, workspace)
lib/editor/         # shared TipTap extension set (spec §5.1 node set)
lib/markdown/       # parse/serialize pipeline + frontmatter preservation
lib/supabase/       # browser / server / admin (service-role) clients
lib/settings.ts     # editor prefs persistence (localStorage + user_settings)
supabase/schema.sql # database schema + RLS policies
tests/              # round-trip fixture suite (vitest)
public/sw.js        # PWA service worker (app-shell caching)
.local/blogide-spec.md # full technical specification
```

## License

MIT — see [LICENSE](./LICENSE).
