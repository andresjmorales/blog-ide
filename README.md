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

You need a Supabase project (hosted or self-hosted) and either Docker or
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
