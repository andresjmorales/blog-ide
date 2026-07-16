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
- Anthropic API keys;
- `.env.local` contents;
- private document content.

The browser may eventually store user-supplied GitHub and Anthropic keys in
IndexedDB. They must never be sent to BlogIDE's server or Supabase. The
Supabase service-role key is server-only and must never use a `NEXT_PUBLIC_`
environment variable.
