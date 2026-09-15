# Privacy

BlogIDE is local-first and self-hostable. This page describes what a hosted
operator can and cannot see, and how the optional vault changes that.

## Accounts and the database

The operator is whoever holds the Supabase dashboard login and the service-role
key for a given deploy. On a self-hosted install that is you. On a shared
hosted deploy that is the person running the instance.

Row-level security keeps other **users** out of your workspace. It does not
hide rows from the operator. Without the vault, document titles, markdown
bodies, revision history, folder names, and link URLs are stored as plaintext.

The operator can also see account email, quota usage, timestamps, and which
rows exist. Backups of the database (Supabase’s, or any dump the operator
makes) contain the same data.

Whether the dashboard login uses MFA is an operator choice, not something the
app can enforce.

## The vault

The vault is an optional folder. Document bodies, names, and link URLs inside
it are encrypted in the browser before they are written to Supabase. The
database stores ciphertext. The operator can still see that a vault document
exists, how large it is, when it changed, and where it sits in the tree — not
the title or the prose.

Images and PDFs are not encrypted in v1. They live in Storage as ordinary
files. Vault essays warn when you insert an image.

The vault passphrase is **not** your sign-in password. A password reset
restores account access; it does not unlock the vault. If both the passphrase
and the recovery code are lost, those documents are unreadable. There is no
operator reset.

The vault is available on every account. There is no plan gate.

## What the vault does not cover

The JavaScript that holds the key is served by the same host as the app.
Anyone who can change that code can change what happens with the passphrase.
That is true of every browser app that encrypts in the page. Mitigations are
ordinary ones: the code is open source, releases are tagged, and you can
self-host.

An unlocked vault keeps plaintext in this browser (IndexedDB and memory). A
local attacker on an already-signed-in device can read it. XSS in the editor
has the same reach.

## Assets

The `assets` bucket is private. Essay images and Library PDFs are served with
time-limited signed URLs, not world-readable public links. A URL that leaks
still works until it expires. Publication HTML that embeds those URLs will
need a fresh copy once they lapse.

## Other secrets

Pushbullet tokens and ntfy topic names are encrypted in `user_secrets` with a
server key (`SECRETS_ENCRYPTION_KEY`, or the service-role key if that is
unset). The operator who holds both the database and that key can decrypt
them. GitHub PATs and AI keys stay in the browser and are never written to
Supabase.

See [SECURITY.md](./SECURITY.md) for how to report a vulnerability.
