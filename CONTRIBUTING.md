# Contributing to BlogIDE

BlogIDE is early-stage software built in deployable milestones. Small,
well-tested changes that preserve the markdown format are preferred.

## Local setup

1. Install Node.js 22 and run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. To use authentication, create a Supabase project, run
   `supabase/schema.sql`, and add the project credentials described in the
   README. Without credentials, the editor runs in preview mode.
4. Start the app with `npm run dev`.

## Before submitting a change

Run:

```bash
npm run lint
npm test
npm run build
```

The round-trip guarantee is non-negotiable:

```text
serializeToMarkdown(parseFromMarkdown(markdown)) === markdown
```

Every new editor node or mark must have a fixture in `tests/fixtures/`.
Unsupported markdown must be preserved as literal text or produce a visible
warning; it must never disappear silently.

## Pull requests

- Keep changes focused and explain the user-visible reason for them.
- Include tests for parsing, serialization, and conflict-prone behavior.
- Test editor changes in both light and dark themes.
- Test responsive UI changes at desktop and phone widths.
- Do not commit credentials, generated build output, or private writing.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system boundaries and
[SECURITY.md](./SECURITY.md) for vulnerability reporting.
