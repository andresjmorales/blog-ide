# BlogIDE

A writing IDE for essays and blog posts, with a research pad beside the
draft: footnotes, a source library, citations, and quick notes. Plain
Markdown, local-first autosave, optional AI. Open source (MIT) and
self-hostable.

## What's in it

**Writing.** A rich-text editor over plain Markdown, with a source toggle
that round-trips byte for byte. Footnotes are first-class: sidenotes or
anchored notes, drag-to-pin cards, and a deleted-note archive. Also math,
tables, poetry blocks, find and replace (regex and in-selection), a writing
check, and focus mode.

**Research.** A Library panel for saved links, PDFs and BibTeX, with Zotero
search, citations, and a list of every source the essay still cites. Link hover previews can be pinned open next to the draft. Notes
channels hold quick captures, optionally fed from Pushbullet or ntfy.

**Copyedit.** A formatting check (quotes, dashes, spacing, repeated words)
with one-click fixes, a dash converter for house style, AI proofread and
consistency passes you review fix by fix, and repairs for messy pastes.

**Publishing.** Copy as rich text, Markdown or HTML. The Publish panel walks
through Substack (native footnotes via a helper, title and subtitle), formats
footnotes for editors that can't take them natively, and checks links and
images before you publish. Export to `.md`, `.html`, zip or PDF (print); Word and Pandoc PDF
when [Pandoc](#word-and-pdf-export-pandoc) is available.

**Sharing and comments.** Share a draft with a reader by email, with view
or comment access. They open a read-only copy and leave
comments anchored to the text they quote; you see the threads in a rail
beside your draft and can reply or resolve them.

**Your files.** Every edit saves to the browser first (IndexedDB) and syncs
to Supabase, with conflict copies and per-document version history.
GitHub backup maps folders or essays to paths in a repo you choose and
pushes them as plain Markdown, and an optional vault folder encrypts essays
in the browser before they're stored.

**Optional AI.** Bring your own Anthropic or OpenAI key (kept on the
device) for a chat sidebar that can critique, tighten, or rewrite a
selection and apply the change as a diff.

It also installs as an app (PWA): long-press the icon for Notes, AI or
Library, or share a link to BlogIDE from another app to save it to the
Library.

Built with Next.js, TypeScript, TipTap and Supabase.

## Self-hosting

You need a Supabase project (hosted, or self-hosted with Docker as in
[3c](#3c-run-everything-yourself-no-supabase-account)) and either Docker or
Node.js 22.

### 1. Set up Supabase

1. In the Supabase **SQL Editor**, run [`supabase/schema.sql`](./supabase/schema.sql).
   It is additive, so re-run it after pulling schema changes.
2. Under **Authentication → URL Configuration**, set the Site URL to where
   BlogIDE will run (for example `http://localhost:3000`) and add
   `/auth/confirm` and `/reset/confirm` as redirect URLs (or `https://your-host/**`).
3. Under **Project Settings → API**, copy the project URL, the publishable
   (anon) key and the secret (service role) key.

### 2. Configure

```bash
cp .env.example .env
```

Fill in the three Supabase values. Keep the secret key out of client code
and out of git (`.env*` is gitignored).

### 3a. Run with Docker

```bash
docker compose up -d --build
```

BlogIDE is then at http://localhost:3000 (change the port with
`BLOGIDE_PORT`). The image includes Pandoc and Typst, so Word import/export
and Pandoc PDF export work with no extra setup.

The Supabase URL and keys are read when the container starts, so after
changing them `docker compose up -d` is enough. The other `NEXT_PUBLIC_*`
values (site URL, hosted and signup-code flags, Stripe key) are compiled
into the browser bundle, so rebuild (`docker compose up -d --build`) after
changing any of those.

Because the image carries no Supabase project, one build can serve any
instance: to run a published image instead of building, set
`BLOGIDE_IMAGE` (for example `ghcr.io/<owner>/blog-ide:latest`) in `.env`,
then `docker compose pull && docker compose up -d`.

### 3b. Run with Node

```bash
npm install
npm run dev          # or: npm run build && npm start
```

Without Supabase credentials the app runs in an unauthenticated preview
mode: the editor works, with no sign-in or cloud sync.

### 3c. Run everything yourself (no Supabase account)

Supabase is open source, so the database, sign-in and file storage can run
in Docker next to BlogIDE. [`compose.supabase.yaml`](./compose.supabase.yaml)
adds Postgres, Auth, the Data API, Storage and a small gateway, and applies
[`supabase/migrations/`](./supabase/migrations/) on every start (each file
once). Skip step 1 above.

```bash
cp .env.example .env
sh docker/supabase/generate-secrets.sh   # paste the output into .env
```

In `.env`, uncomment `COMPOSE_FILE` (on Windows, separate the two files with
`;`) and the `APP_URL` / `SUPABASE_PUBLIC_URL` lines, then:

```bash
docker compose up -d --build
```

BlogIDE is at http://localhost:3000, and the gateway the browser talks to is
at http://supabase.localhost:8000. With `COMPOSE_FILE` set, plain commands
cover the whole stack: `docker compose ps`, `docker compose logs auth`,
`docker compose down`. Data lives in Docker volumes, so `down` keeps it and
`down -v` deletes it.

Password-reset emails need SMTP (`AUTH_SMTP_*` in `.env`, Resend works). To
see them locally without one, run `docker compose --profile mail up -d`,
set `AUTH_SMTP_HOST=mail` and `AUTH_SMTP_ADMIN_EMAIL=noreply@blogide.localhost`,
and open http://localhost:8025. The reset link goes straight to
`/auth/confirm` (see [docs/HOSTED_OPERATOR.md](./docs/HOSTED_OPERATOR.md)),
with no extra setup. Public signup on Auth is closed; accounts are created
through BlogIDE's own signup page.

**On a server**, put a reverse proxy with HTTPS in front of the app and the
gateway, and keep both ports private. With [Caddy](https://caddyserver.com),
for example:

```
blogide.example {
  reverse_proxy 127.0.0.1:3000
}
api.blogide.example {
  reverse_proxy 127.0.0.1:8000
}
```

```bash
# .env
BLOGIDE_PORT=127.0.0.1:3000
SUPABASE_GATEWAY_BIND=127.0.0.1:8000
APP_URL=https://blogide.example
NEXT_PUBLIC_SITE_URL=https://blogide.example
SUPABASE_PUBLIC_URL=https://api.blogide.example
```

**Supabase Studio** (table editor, SQL editor, users, storage):
`docker compose --profile studio up -d`, then open http://localhost:3001.
Studio has no login of its own, so it only listens on the machine itself.
On a server, reach it through an SSH tunnel
(`ssh -L 3001:localhost:3001 you@your-server`, then the same address) and
never give it a public domain. The log explorer is not included.

**Backups:** `docker compose --profile backup up -d` dumps the database, the
uploaded files and `.env` into `./backups` every night (keeping 14 days).
Copy that folder off the machine as well.

#### Moving from Supabase Cloud

`import` copies accounts, every BlogIDE table and all uploaded files from a
Cloud project into a fresh stack. The Cloud project is only read from.

1. Start the new stack once (`docker compose up -d`) so the migrations run,
   then `docker compose stop blogide`.
2. In `.env`, set the Cloud project's values:
   - `SOURCE_DB_URL`: **Connect → Session pooler** connection string, with
     your database password filled in
   - `SOURCE_SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `SOURCE_SERVICE_ROLE_KEY`: the secret (service role) key
3. `docker compose --profile import run --rm import`
4. `docker compose up -d`, then sign in with your usual password.

Everyone signs in once more after the move, because sessions are not copied.
Images in essays point at the old project until they are opened: the editor
re-signs each one against the new stack the first time it loads. Keep the
Cloud project until you have checked your essays, then delete it.

### Word and PDF export (Pandoc)

Export → PDF (print) works everywhere through the browser. Word
(`.docx`) export and import, and PDF generated on the server, need
[Pandoc](https://pandoc.org/). The Docker image already has it. On a Node
host, install Pandoc and a PDF engine (Typst, xelatex or WeasyPrint), then
set:

```bash
PANDOC_PATH=/usr/bin/pandoc
PANDOC_PDF_ENGINE=typst
```

Vercel doesn't provide Pandoc, so on a Vercel deploy those features stay
off. See [docs/PUBLISH_EXPORT.md](./docs/PUBLISH_EXPORT.md).

### Applying migrations from CI (optional)

On pushes to `main`, CI can run `supabase db push` to apply new files in
[`supabase/migrations/`](./supabase/migrations/). Add these repository
secrets to turn it on (without them the step is skipped):
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` (the project reference ID)
and `SUPABASE_DB_PASSWORD`.

### Running a shared instance

Self-host installs have open signup and no billing. For a shared,
multi-user deploy like blogide.com (storage tiers, optional signup codes),
see
[docs/HOSTED_OPERATOR.md](./docs/HOSTED_OPERATOR.md).

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md): system boundaries, sync, quota, repo map
- [docs/MARKDOWN_SPEC.md](./docs/MARKDOWN_SPEC.md): how BlogIDE's Markdown differs from GFM
- [docs/PUBLISH_EXPORT.md](./docs/PUBLISH_EXPORT.md): copy formats, footnotes on other platforms, Pandoc
- [CONTRIBUTING.md](./CONTRIBUTING.md): setup, tests, pull requests
- [SECURITY.md](./SECURITY.md): reporting vulnerabilities
- [PRIVACY.md](./PRIVACY.md)

## Support

If BlogIDE is useful to you, you can support development through
[Buy Me a Coffee](https://buymeacoffee.com/andresjmorales).

## License

MIT. See [LICENSE](./LICENSE).
