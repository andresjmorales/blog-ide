-- BlogIDE Supabase schema (spec §4.2)
-- Run this in the Supabase SQL editor (or via supabase db push).
-- Auth itself is handled by Supabase Auth (email/password).

create table if not exists beta_codes (
  code text primary key,
  created_at timestamptz default now(),
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz
);

create table if not exists user_settings (
  user_id uuid primary key references auth.users(id),
  github_repo text,              -- "owner/repo"
  github_branch text default 'main',
  -- NOTE: GitHub token and Anthropic key are NOT stored here (spec §8).
  editor_prefs jsonb default '{}',
  updated_at timestamptz default now()
);

create table if not exists doc_index (
  user_id uuid references auth.users(id),
  path text,                     -- repo-relative path
  title text,
  status text,
  last_synced_sha text,
  updated_at timestamptz default now(),
  primary key (user_id, path)
);

-- Row Level Security -------------------------------------------------------

alter table beta_codes enable row level security;
alter table user_settings enable row level security;
alter table doc_index enable row level security;

-- beta_codes: no client access at all. Redemption happens exclusively via
-- the server signup route using the service-role key (which bypasses RLS).
-- (No policies created = all non-service access denied.)

-- user_settings: owner-only read/write.
create policy "user_settings owner select" on user_settings
  for select using (auth.uid() = user_id);
create policy "user_settings owner insert" on user_settings
  for insert with check (auth.uid() = user_id);
create policy "user_settings owner update" on user_settings
  for update using (auth.uid() = user_id);
create policy "user_settings owner delete" on user_settings
  for delete using (auth.uid() = user_id);

-- doc_index: owner-only read/write.
create policy "doc_index owner select" on doc_index
  for select using (auth.uid() = user_id);
create policy "doc_index owner insert" on doc_index
  for insert with check (auth.uid() = user_id);
create policy "doc_index owner update" on doc_index
  for update using (auth.uid() = user_id);
create policy "doc_index owner delete" on doc_index
  for delete using (auth.uid() = user_id);

-- Seed example (run manually): insert into beta_codes (code) values ('WRITE-2026');
