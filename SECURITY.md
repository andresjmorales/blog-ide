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
- Pushbullet access tokens and ntfy topic names;
- Anthropic / OpenAI API keys;
- `.env.local` contents;
- private document content.

User-supplied Anthropic/OpenAI keys, GitHub PATs, and Zotero API keys stay
in the browser (localStorage). Pushbullet and ntfy secrets are encrypted (AES-256-GCM) in
`user_secrets` and only decrypted by `/api/secrets` for the signed-in owner.
A database dump without the server encryption key is not enough to read them.
Anyone who holds both the database and `SECRETS_ENCRYPTION_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` can decrypt them. That is the same operator-trust
model as encrypting secrets in your own Supabase project.

The Supabase service-role key is server-only and must never use a
`NEXT_PUBLIC_` environment variable.
