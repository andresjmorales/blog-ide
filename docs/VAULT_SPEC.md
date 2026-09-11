# Vault — end-to-end encrypted folder (draft spec)

Status: **draft, not implemented.** This is a design document, not a record
of shipped behaviour.

One opt-in folder per account whose document bodies and names are encrypted
in the browser before they reach Supabase. Everything outside the vault is
untouched. The operator (whoever holds the Supabase dashboard login or the
service-role key) can list vault rows and see their sizes and timestamps,
but cannot read titles or prose.

- [Why](#why)
- [Threat model](#threat-model) — including what this does **not** protect
- [Phase 0: prerequisites](#phase-0-prerequisites)
- [Shape](#shape)
- [Crypto](#crypto)
- [Schema](#schema)
- [Quota](#quota)
- [Conflict dedupe](#conflict-dedupe)
- [Moving in and out](#moving-in-and-out)
- [Lock and unlock](#lock-and-unlock)
- [GitHub, export, and the server-side features](#github-export-and-the-server-side-features)
- [Plan gating and cancellation](#plan-gating-and-cancellation)
- [Recovery](#recovery)
- [What we must not claim](#what-we-must-not-claim)
- [Phasing](#phasing)
- [Open decisions](#open-decisions)

---

## Why

Today `documents.markdown`, `document_revisions.markdown` (last 20 versions),
and `workspace_nodes.name` are plaintext `text` columns. RLS keeps other
*users* out, and the service-role key never touches documents — every
`createAdminClient()` call site is signup, billing, or the secrets vault, and
the browser talks to Supabase directly under RLS. So essays do not transit
the Next.js server except when the user explicitly invokes pandoc export or
the AI proxy.

The residual exposure is narrow but real: **one key** (Supabase dashboard
login / service-role key) reads every essay ever written, including history.
That is the industry default — Notion, Substack, Medium, and Google Docs are
all in the same position — but essays are an unusually sensitive category
(unpublished work, journalism, memoir), and BlogIDE's local-first story
already primes users to expect that their drafts stay theirs.

The vault makes that one key insufficient, for the documents the user chooses.

---

## Threat model

**Protects against**

| Threat | How |
| --- | --- |
| Operator reads the database out of curiosity or under pressure | Ciphertext only |
| Database dump / backup leak | Ciphertext only |
| `SUPABASE_SERVICE_ROLE_KEY` leaks (build log, laptop, supply chain) | Key does not decrypt documents |
| Supabase account takeover | Same |
| Legal demand served on the operator for document contents | Nothing useful to hand over |

**Does not protect against** — state these plainly in the UI and in
`PRIVACY.md`:

- **Compromised or malicious frontend code.** The server ships the
  JavaScript that holds the key. Anyone who can change what Vercel serves can
  exfiltrate the passphrase. This is the fundamental limit of browser-based
  E2EE and it applies to every web app that claims it. Mitigations are
  transparency, not cryptography: open source, reproducible builds, tagged
  releases, and self-hosting as the escape hatch.
- **A local attacker on an unlocked device.** Unlocked vault plaintext lives
  in IndexedDB and in memory. See [Lock and unlock](#lock-and-unlock).
- **XSS in the editor.** Same reason.
- **Metadata.** Row counts, ciphertext sizes, `updated_at`, folder structure,
  and *which* documents are in the vault all stay visible to the operator.

**Explicitly out of scope for v1:** images and PDFs. Assets stay unencrypted
in Storage (but see [Phase 0](#phase-0-prerequisites)). Encrypting image
bytes means `<img src>` can no longer point at Supabase — every render needs
fetch-then-decrypt-then-blob-URL, which breaks publication preview and
export until re-inlined. That is where the real performance and UX cost
lives, and it should not hold up the text feature. **Vault documents warn
when an image is inserted.**

---

## Phase 0: prerequisites

These stand on their own and should ship first, vault or no vault.

1. **Make the assets bucket private.**
   `supabase/migrations/20260717153000_storage_assets.sql:6` creates the
   bucket with `public: true`. The RLS policies below it do not apply to a
   public bucket — objects are served to unauthenticated requests. Paths are
   UUID-prefixed so they are unguessable, but any leaked or pasted image URL
   is world-readable forever. `lib/assets/upload.ts:98` already has the
   `createSignedUrl` fallback path; make it the primary. Needs a refresh
   strategy for expiring URLs in long editing sessions.

2. **Write `PRIVACY.md`.** Plain language: what the operator can see, what
   they cannot, where backups live, who holds the dashboard login, whether
   it has MFA. `SECURITY.md:33-39` already does this well for the secrets
   vault — extend the same honesty to documents. The absence of a statement
   costs more trust than the plaintext does.

---

## Shape

**One vault folder per account**, realised as a system node:

```
workspace_nodes.system_key = 'vault'
```

This reuses `workspace_nodes_user_system_key_uidx`
(`20260716230000_workspace_trash.sql:5`), the same partial unique index that
already guarantees one `trash` and one `inbox` per user. Uniqueness is
enforced by the database, not by application logic.

- Sits at the tree root alongside Trash and Inbox.
- Not movable — `move_workspace_node` already rejects `system_key in
  ('trash', 'inbox')` (`schema.sql:855`); add `'vault'` to that list.
- Not renameable, not trashable.
- **Nested folders inside are allowed** and inherit encryption. "In the
  vault" means "has the vault node as an ancestor".
- Rendered with a lock glyph on the folder and on every descendant row.
- Links (`kind = 'link'`) inside the vault: encrypt `name`, and encrypt
  `url` too — a bare URL is often the whole secret.

The invariant the rest of this document depends on:

> **A document node is under the vault if and only if
> `documents.enc = 1`.**

Vault membership is the user-facing concept; `enc` is the storage fact. They
can drift during an interrupted move, and a reconciler repairs the drift on
unlock. See [Moving in and out](#moving-in-and-out).

---

## Crypto

Reuse the envelope from `lib/secrets/crypto.ts` so the codebase has exactly
one ciphertext format. That module is Node-side (`node:crypto`); the vault
needs the WebCrypto equivalent in `lib/vault/crypto.ts`, byte-compatible.

**Envelope** (`bytea`, not base64 — see [Quota](#quota)):

```
version:u8 || iv:12 || tag:16 || ciphertext:...      // 29 bytes overhead
```

`version = 1` means AES-256-GCM with a random per-save IV. Never reuse an IV
under one key; `crypto.getRandomValues` per save is correct and cheap.

**Key hierarchy**

```
passphrase    --KDF--> KEK_pass --wraps--> DEK (random 256-bit)
recovery code --KDF--> KEK_rec  --wraps-->  |
                                            +- AES-GCM: document bodies
                                            +- AES-GCM: node names / urls
                                            +- HKDF --> dedupe key (HMAC)
```

- **DEK**: 32 random bytes, generated once at vault creation, never leaves
  the browser unwrapped. All content encryption uses it directly — no
  per-document keys in v1. (Per-document keys wrapped by the DEK would be
  nicer if sharing is ever added; not worth the complexity now.)
- **Passphrase is separate from the login password.** Non-negotiable:
  Supabase sees the login password at `signInWithPassword`
  (`components/LoginForm.tsx:25`), and `resetPasswordForEmail`
  (`components/ResetRequestForm.tsx:23`) would otherwise silently destroy
  the vault on every password reset.
- **KDF for v1: PBKDF2-HMAC-SHA-256, 600,000 iterations, 16-byte random
  salt.** Native in WebCrypto, zero dependencies. Store `kdf`, `kdf_params`,
  and `salt` alongside the wrapped DEK so Argon2id (via `hash-wasm`) can be
  added as `kdf = 'argon2id'` later without touching existing vaults.
  Migration on unlock: if `kdf` is older than current policy, re-wrap after a
  successful unwrap.

**Performance.** This is not where the app gets slow. AES-GCM through
WebCrypto is hardware-accelerated; a 100 KB essay encrypts in well under a
millisecond, and the entire 100 MiB Pro quota decrypts in roughly the time
TipTap spends parsing one document. The only expensive operation is the KDF
(~0.5-1s at 600k iterations), and it runs **once per unlock**, never per
keystroke. Autosave latency is unchanged.

**Key handling in memory**

- Import the DEK as a non-extractable `CryptoKey` (`extractable: false`).
- Hold it in a module-level variable in `lib/vault/session.ts`. Never in
  React state, never in `localStorage`, never in a global.
- Optionally persist the non-extractable `CryptoKey` into IndexedDB so a page
  refresh does not re-prompt. IndexedDB can store `CryptoKey` objects
  without exposing raw bytes to JS. Gate this behind a "stay unlocked on
  this device" checkbox, default **off**.

---

## Schema

All additive. A vault that is never created changes nothing.

**`documents`**

```sql
alter table documents add column if not exists ciphertext bytea;
alter table documents add column if not exists enc smallint not null default 0;
```

`enc = 0` means plaintext in `markdown`, `ciphertext` null (every existing
row). `enc = 1` means ciphertext in `ciphertext`, `markdown = ''`.

Keeping both columns makes the change rollback-safe and lets the move
protocol write the new state before clearing the old.

**`workspace_nodes`**

```sql
alter table workspace_nodes add column if not exists name_enc bytea;
alter table workspace_nodes add column if not exists url_enc bytea;
```

When `name_enc` is present, `name` holds a non-identifying placeholder
(`'encrypted'`) so `not null` and existing ordering queries keep working.
Sorting vault siblings happens client-side after decrypt — the tree is
already fully loaded by `listWorkspaceNodes()` (`lib/workspace/api.ts:43`),
so this costs nothing.

**`document_revisions`**

Same `ciphertext` / `enc` pair. History works normally; rows are ciphertext
and decrypt client-side in `VersionHistoryPanel`.

**New table `user_vault`**

```sql
create table if not exists user_vault (
  user_id uuid primary key references auth.users(id) on delete cascade,
  node_id uuid not null references workspace_nodes(id) on delete cascade,
  dek_wrapped_pass bytea not null,
  kdf text not null default 'pbkdf2-sha256',
  kdf_params jsonb not null default '{"iterations":600000}'::jsonb,
  salt_pass bytea not null,
  dek_wrapped_recovery bytea not null,
  salt_recovery bytea not null,
  verifier bytea not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`verifier` is a known constant encrypted under the DEK, so a wrong
passphrase fails fast and distinguishably instead of producing garbage
plaintext. (AES-GCM's auth tag already does this, but an explicit verifier
keeps the "is this passphrase right" check independent of any document.)

RLS: owner-select only, mirroring `document_revisions`
(`20260721120000:24-30`). Writes go through definer RPCs; revoke direct
grants.

**RPC changes**

| RPC | Change |
| --- | --- |
| `save_document` | Add `p_ciphertext bytea default null`, `p_enc smallint default 0`, `p_conflict_key text default null`. Byte accounting branches on `p_enc`. |
| `create_workspace_node` | Add `p_name_enc bytea`, `p_url_enc bytea`, `p_ciphertext bytea`, `p_enc smallint`. |
| `create_document_conflict_copy` | Accept the client-supplied `p_conflict_key`; keep the md5 fallback. |
| `move_workspace_node` | Add `'vault'` to the system-item guard. |
| `create_vault` | **New.** Plan check, creates the node + `user_vault` row atomically. |
| `purge_document_revisions` | **New.** Deletes all `document_revisions` for one owned node. Required by the move-in path. |

Postgres overloads by signature, so adding defaulted parameters keeps the
existing client calls working during rollout.

---

## Quota

`save_document` computes `utf8_bytes(p_markdown)`
(`20260721120000:80`). Branch it:

```sql
new_bytes := case when p_enc = 1
  then pg_catalog.octet_length(p_ciphertext)::bigint
  else public.utf8_bytes(p_markdown) end;
```

Because the envelope is `bytea` rather than base64, overhead is a flat **29
bytes per document**, not the 1.37x a base64 column would cost. No changes
needed to `FREE_QUOTA_BYTES` or `PRO_QUOTA_BYTES` in `lib/billing/plans.ts`.

The same branch is needed in `create_workspace_node` (`schema.sql:664`) and
`create_document_conflict_copy` (`20260808215522:171`).

---

## Conflict dedupe

The problem, stated precisely:

`create_document_conflict_copy` builds an idempotency key in SQL from the
plaintext (`20260808215522:130`):

```sql
copy_key := pg_catalog.md5(
  p_origin_id::text || chr(31) || p_base_version::text || chr(31) || p_markdown
);
```

With a random IV per save, encrypting identical plaintext twice produces
different ciphertext. Hashing the ciphertext would therefore give a different
key every attempt, the `conflict_key` lookup would always miss, and **a
retried conflict would spawn duplicate conflict copies** — exactly the bug
`20260808215522_harden_conflict_resolution.sql` exists to prevent.

**Fix:** the client computes the key over the *plaintext* and passes it in.

```ts
// lib/vault/dedupe.ts
const dedupeKey = await hkdf(dek, "blogide/conflict-dedupe/v1"); // HMAC key
const conflictKey = toHex(await hmacSha256(
  dedupeKey,
  `${originId}${baseVersion}${plaintext}`
));
```

Properties that make this correct:

- **Deterministic** — same plaintext, same key, same result, so retries
  dedupe.
- **Stable across devices** — every device unwraps the same DEK, so a phone
  and a laptop agree on the key for the same conflict.
- **Opaque to the server** — HMAC under a key the server never sees, so it
  is not an offline-guessable hash of the document.

The RPC signature becomes `p_conflict_key text default null`; when null it
falls back to today's md5 path, so non-vault documents are byte-identical in
behaviour.

---

## Moving in and out

This is the hardest part of the feature, and the reason is structural:

> **A move across the vault boundary is not a move. It is a re-encrypt and
> rewrite, and the database cannot perform it** — Postgres has neither the
> DEK nor the plaintext.

So it must be client-orchestrated, multi-step, interruptible, and therefore
*resumable*. Design for the crash, not the happy path.

### Moving in (plaintext to vault)

Per document, in this order:

1. Read plaintext (dirty local copy from IndexedDB wins, else remote).
2. Encrypt body; encrypt `name` (and `url` for links).
3. `save_document(node, ciphertext, enc => 1, base_version)` — this bumps
   the version and writes one **ciphertext** revision, as normal.
4. **`purge_document_revisions(node)`** — essential. Up to 20 plaintext
   versions are sitting in `document_revisions` (`20260721120000:93`). A
   move-in that leaves them behind has encrypted nothing that matters: the
   prose is still right there in a table the operator can read. History
   restarts at the move; say so in the confirmation dialog.
5. `move_workspace_node(node, vault_id)` and write `name_enc`.
6. Overwrite the local IndexedDB copy and re-cache.

Move is **last**, so a crash leaves `enc = 1` on a node outside the vault —
detectable, and safe (over-encrypted, never under-encrypted).

### Moving out (vault to plaintext)

Mirror image, same ordering principle:

1. Decrypt body and name.
2. `save_document(node, plaintext, enc => 0, base_version)`.
3. `purge_document_revisions(node)` — drops the ciphertext history, which is
   now undecryptable-in-context noise, and avoids a mixed-`enc` history.
4. `move_workspace_node(node, target)`, clear `name_enc` / `url_enc`.

A crash here leaves `enc = 0` on a node still inside the vault — a genuine
plaintext leak, so this is the direction that needs the reconciler most.

### Folders

Recurse depth-first over descendants, batched, driven through the existing
progress/toast infrastructure (`lib/assets/uploadStatus.ts` is the closest
analogue). Move the folder node itself last. A partially-moved folder is a
valid intermediate state that the reconciler finishes.

### Reconciler

On every unlock, and after any interrupted move, walk the tree and compare
vault membership against `enc`:

| State | Meaning | Repair |
| --- | --- | --- |
| under vault, `enc = 1` | correct | — |
| outside vault, `enc = 0` | correct | — |
| outside vault, `enc = 1` | move-in crashed after step 3 | finish the move in (default) or decrypt back out, by user choice |
| under vault, `enc = 0` | move-out crashed after step 2 | **encrypt immediately**, no prompt — this is an active leak |

Surface a one-line toast when the reconciler does anything. Never repair
silently in the direction that reduces protection.

### Guards

- Refuse any move across the boundary while the vault is locked.
- Refuse while the document is dirty-and-unsynced; flush first.
- Take the boundary crossing off the ordinary drag-and-drop path — require an
  explicit "Move to vault" / "Move out of vault" command with a confirmation
  naming the history purge. Dragging a folder of essays into the vault should
  not be a one-pixel accident.

---

## Lock and unlock

**Locked** is the default on every page load (unless "stay unlocked on this
device" is on).

Locked state renders the vault folder with a lock glyph and no children —
not "hidden children", *unreadable* ones: `name_enc` means the client
genuinely cannot render the names. Clicking prompts for the passphrase.

**Unlock** derives the KEK, unwraps the DEK, verifies against `verifier`,
imports a non-extractable `CryptoKey`, runs the reconciler, decrypts names,
and renders.

**Lock now** must do more than flip a boolean, because of where plaintext
accumulates locally:

- Drop the in-memory `CryptoKey` and any IndexedDB-persisted copy.
- **Evict vault documents from the IndexedDB `docs` store**
  (`lib/db/indexed.ts:18`), which holds plaintext markdown.
- **Evict vault node names from the `treeCache` localStorage entry**
  (`lib/workspace/treeCache.ts:64`), which serialises the whole node list
  including `name`.
- Close any open vault editor tabs and pop-outs.
- Clear vault titles from the `docTitles` map (`lib/workspace/docTitles.ts`).

Auto-lock on: sign-out, explicit command, and an optional idle timeout
(off / 15m / 1h / 8h, default off).

**Refuse to lock while a vault document has unsynced dirty edits** — flush
first, or the user loses work to a privacy feature, which is the worst
possible trade.

---

## GitHub, export, and the server-side features

### GitHub push — feasible, gated

`pushWorkspaceToGithub` (`lib/github/push.ts:41`) runs entirely in the
browser: `listAllDocumentBodies()` then `pushFilesToGithub` straight to
`api.github.com` (`lib/github/client.ts:13`). **Vault plaintext would never
touch BlogIDE's server**, so including vault documents does not violate the
threat model at all.

Whether it is *sensible* depends entirely on the destination repo. So:

- Vault documents are **excluded by default** from both workspace-scope and
  node-scope pushes.
- A separate Settings toggle, "Include vault in GitHub push", which:
  1. requires the vault unlocked at push time;
  2. calls `GET /repos/{owner}/{repo}` and **refuses unless `private ===
     true`** — no such check exists today, `lib/github/repo.ts` only parses
     the `owner/repo` string;
  3. shows a one-time explicit confirmation naming the repo;
  4. re-checks visibility on every push, since a repo can be flipped public
     later.
- The push summary toast states how many vault documents were included.

This is the user's own private repo and their own decision — the job is to
make it deliberate rather than a footgun.

### Zip export

Include vault documents when unlocked (`lib/export/workspaceZip.ts:64` — it
is a local download, the user's own plaintext on their own disk). State it in
the toast. When locked, exclude and say so rather than silently producing a
short archive.

### Features that must be blocked inside the vault

Each of these sends document text to a server, which is precisely what the
user paid to prevent:

| Feature | Route | v1 behaviour |
| --- | --- | --- |
| Pandoc `.docx` export | `app/api/export/docx/route.ts:31` | **Blocked.** Offer Copy, `.md` download, print-to-PDF — all client-side. |
| Pandoc PDF export | `app/api/export/pdf/route.ts` | **Blocked.** Same. |
| Pandoc import | `app/api/import/pandoc/route.ts` | Blocked as a *destination*; import outside, then move in. |
| AI sidebar | `app/api/ai/chat/route.ts` | **Blocked by default.** BYOK, but it transits your server and then a third party. Per-session opt-in with an explicit confirm naming the provider. |
| Link preview / URL check | `app/api/link-preview`, `app/api/url-check` | Blocked — leaks URLs from vault prose. |
| Reader extract | `app/api/reader` | Blocked. |

Everything client-side keeps working unchanged: TipTap, footnotes, find and
replace, Harper spellcheck (WASM, local), publication preview, markdown
source view, Copy to Rich text / Markdown / HTML.

Blocked features should be visibly disabled with a one-line reason
("Unavailable in the vault — this would send the essay to the server"), not
silently missing. The constraint *is* the feature.

---

## Plan gating and cancellation

The governing principle, and it is the right one:

> **Cancelling never decrypts, deletes, or locks anyone out. Ever.**

There is good precedent in the codebase. Downgrading today drops
`quota_bytes` from 100 MiB to 10 MiB (`lib/billing/applyPlan.ts:26`) but
deletes nothing — `save_document` simply starts returning `'quota'`.
Degradation is refusal-to-grow, never destruction. The vault follows the
same shape:

| Plan state | Create vault | Unlock, read, edit | Export / decrypt out | Quota |
| --- | --- | --- | --- | --- |
| Pro | yes | yes | yes | 100 MiB |
| Free, never had a vault | **no** | n/a | n/a | 10 MiB |
| Free, downgraded with a vault | no | **yes, forever** | **yes, forever** | 10 MiB |

What Pro actually gates is **creating** the vault — a `plan = 'pro'` check
inside the new `create_vault` RPC, server-side, where the client cannot
forge it (clients already cannot write `plan` or `quota_bytes`; the grants
in `20260901194500_capture_state.sql:6` enumerate the writable columns).

After a downgrade the vault is an ordinary folder that happens to be
encrypted. It unlocks, reads, edits, and exports indefinitely. No expiry, no
read-only mode, no countdown banner. If they resubscribe, nothing needs
restoring — it simply keeps working.

**The one open question** is whether a downgraded user can add *new*
documents to an existing vault. Recommendation: **yes, allow it.** Blocking
it creates a bizarre half-state (you may edit this document to 10,000 words
but not create a second one), it is hard to explain, and it punishes exactly
the user who cared most about the feature. The cost is that $5 once buys the
vault permanently — a real leak, but at this price point the friction of
subscribe-create-cancel is its own deterrent, and the reputational cost of
degrading a privacy feature is far higher than the lost revenue. The
stricter alternative (free users may edit existing vault documents but not
add new ones) is a one-line check in `create_workspace_node` if the leak
ever actually matters.

**Deleting the vault** is a separate, explicit, destructive action: requires
unlock, offers to decrypt everything back out to a chosen folder first, and
demands typed confirmation. Never offered as a fix for a forgotten
passphrase.

---

## Recovery

There is none, and that has to be said out loud before the user commits.

At creation, in one dialog:

1. Choose a passphrase (separate from the login password — say why).
2. **Receive a recovery code** — 32 bytes, base32, grouped, displayed once.
   It wraps a second copy of the DEK.
3. Confirm you have stored it, by retyping a segment. Not a checkbox.
4. Read and acknowledge, verbatim and unhedged: *"If you lose both your
   passphrase and your recovery code, these documents are permanently
   unreadable. No one — including the operator — can recover them. There is
   no reset."*

A password reset (`resetPasswordForEmail`) restores **account** access but
not the vault. The reset flow must say so before it is used by anyone with a
vault.

Offer "Change passphrase" (re-wrap the DEK, cheap, no re-encryption of
documents) and "Regenerate recovery code" from Settings.

---

## What we must not claim

Getting this wrong is worse than not shipping. Solo projects that oversell
encryption lose more trust than they ever gained.

**Do say:** "Vault essays are encrypted in your browser before they reach
the server. The database stores ciphertext — the operator can see that a
document exists and how large it is, but cannot read it."

**Do not say:** "zero-knowledge", "we can never see your data", "military
grade", or anything implying the guarantee survives a compromised frontend.
It does not, and a knowledgeable reader will notice the overclaim and
discount everything else on the page.

Publish the limits alongside the feature. The honesty is what makes it
credible.

---

## Phasing

Each phase is independently shippable and leaves `main` working.

| Phase | Scope | Ships |
| --- | --- | --- |
| **0** | Private assets bucket, `PRIVACY.md` | Yes — independent of the vault |
| **1** | `lib/vault/crypto.ts` + `dedupe.ts` + unit tests against `lib/secrets/crypto.ts` vectors. No schema, no UI. | Internal |
| **2** | Migration: columns, `user_vault`, RPC signatures. Old clients unaffected (all params defaulted). | Yes, dormant |
| **3** | `create_vault`, unlock/lock, create + edit + read inside the vault, lock glyph. Move in/out **not yet enabled**. | Beta flag |
| **4** | Move in/out, revision purge, reconciler. The riskiest phase — fuzz it against interruption. | Beta flag |
| **5** | GitHub opt-in + repo-visibility check, zip export, blocked-feature affordances, recovery-code UX, docs. | Public |

Test priorities, in order of how much they would hurt if wrong:

1. Interrupt every step of move-in and move-out; assert the reconciler never
   lands on `under vault && enc = 0`.
2. Assert `document_revisions` holds no plaintext for any vault node after a
   move-in.
3. Two devices, same vault, concurrent edits produce exactly one conflict
   copy.
4. Quota arithmetic across mixed `enc = 0` / `enc = 1` workspaces.
5. Downgrade, unlock, edit, export still works.
6. Round-trip every construct in `docs/MARKDOWN_SPEC.md` through
   encrypt/decrypt byte-for-byte.

---

## Open decisions

1. **Free users adding new documents to an existing vault** — recommended
   yes, see [Plan gating](#plan-gating-and-cancellation).
2. **Idle auto-lock default** — recommended off. A vault that locks mid-essay
   and drops a draft is worse than one that stays open.
3. **"Stay unlocked on this device"** — recommended available, default off.
4. **Argon2id now or later** — later; the `kdf` column makes it a
   non-breaking upgrade, and PBKDF2 at 600k is defensible today.
5. **Encrypted assets** — explicitly deferred. Revisit only after the text
   vault has been in real use for a while.

---

## Related

- Current trust model: [SECURITY.md](../SECURITY.md)
- Architecture / quota model: [ARCHITECTURE.md](../ARCHITECTURE.md)
- Hosted operator runbook: [HOSTED_OPERATOR.md](./HOSTED_OPERATOR.md)
