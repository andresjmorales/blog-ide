# Security Policy

## Supported versions

BlogIDE is pre-release software. Security fixes are applied to the latest
version on the `main` branch; older commits and forks are not maintained.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
private vulnerability reporting feature on the repository's **Security** tab.
Include:

- the affected route, component, or configuration;
- steps to reproduce;
- the likely impact;
- any suggested mitigation.

You should receive an acknowledgement within seven days. Please allow time for
a fix before disclosing the issue publicly.

## Sensitive data

Never commit or include these values in reports:

- Supabase service-role keys;
- GitHub personal access tokens;
- Anthropic / OpenAI API keys;
- `.env.local` contents;
- private document content.

User-supplied Anthropic/OpenAI keys are stored in the browser (localStorage)
and may be forwarded ephemerally through a Next.js proxy for CORS. They must
never be persisted in Supabase or server env. The Supabase service-role key is
server-only and must never use a `NEXT_PUBLIC_` environment variable.
