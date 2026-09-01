-- Encrypted per-user integration secrets (Pushbullet, ntfy, …).
-- Ciphertext only; encryption key lives in the Next.js server env.
-- No authenticated/anon access: reads and writes go through /api/secrets.

create table if not exists user_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

alter table user_secrets enable row level security;

revoke all on table user_secrets from public, anon, authenticated;
