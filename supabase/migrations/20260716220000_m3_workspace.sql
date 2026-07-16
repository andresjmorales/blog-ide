-- BlogIDE Supabase schema (spec §4.2)
-- Run this in the Supabase SQL editor (or via supabase db push).
-- Safe to re-run on an existing project (IF NOT EXISTS / additive alters).

create extension if not exists pgcrypto;

-- Auth itself is handled by Supabase Auth (email/password).

create table if not exists beta_codes (
  code text primary key,
  created_at timestamptz default now(),
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz
);

create table if not exists user_settings (
  user_id uuid primary key references auth.users(id),
  github_repo text,              -- optional one-way backup: "owner/repo"
  github_branch text default 'main',
  -- NOTE: GitHub token and Anthropic key are NOT stored here (spec §8).
  editor_prefs jsonb default '{}',
  used_bytes bigint not null default 0,
  quota_bytes bigint not null default 209715200,
  updated_at timestamptz default now()
);

-- Additive columns for projects created before M3.
alter table user_settings add column if not exists used_bytes bigint not null default 0;
alter table user_settings add column if not exists quota_bytes bigint not null default 209715200;

create table if not exists workspace_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references workspace_nodes(id) on delete cascade,
  kind text not null check (kind in ('folder', 'document', 'link')),
  name text not null,
  position integer not null default 0,
  url text,
  pinned boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists workspace_nodes_user_parent_idx
  on workspace_nodes (user_id, parent_id, position);

create table if not exists documents (
  node_id uuid primary key references workspace_nodes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  markdown text not null default '',
  status text,
  version bigint not null default 1,
  size_bytes bigint not null default 0,
  updated_at timestamptz default now()
);

create index if not exists documents_user_idx on documents (user_id);

-- Drop obsolete stub from M1 if present.
drop table if exists doc_index;

-- Row Level Security -------------------------------------------------------

alter table beta_codes enable row level security;
alter table user_settings enable row level security;
alter table workspace_nodes enable row level security;
alter table documents enable row level security;

-- beta_codes: no client policies (service-role signup only).

drop policy if exists "user_settings owner select" on user_settings;
drop policy if exists "user_settings owner insert" on user_settings;
drop policy if exists "user_settings owner update" on user_settings;
drop policy if exists "user_settings owner delete" on user_settings;
create policy "user_settings owner select" on user_settings
  for select using (auth.uid() = user_id);
create policy "user_settings owner insert" on user_settings
  for insert with check (auth.uid() = user_id);
create policy "user_settings owner update" on user_settings
  for update using (auth.uid() = user_id);
create policy "user_settings owner delete" on user_settings
  for delete using (auth.uid() = user_id);

drop policy if exists "workspace_nodes owner select" on workspace_nodes;
drop policy if exists "workspace_nodes owner insert" on workspace_nodes;
drop policy if exists "workspace_nodes owner update" on workspace_nodes;
drop policy if exists "workspace_nodes owner delete" on workspace_nodes;
create policy "workspace_nodes owner select" on workspace_nodes
  for select using (auth.uid() = user_id);
create policy "workspace_nodes owner insert" on workspace_nodes
  for insert with check (auth.uid() = user_id);
create policy "workspace_nodes owner update" on workspace_nodes
  for update using (auth.uid() = user_id);
create policy "workspace_nodes owner delete" on workspace_nodes
  for delete using (auth.uid() = user_id);

drop policy if exists "documents owner select" on documents;
drop policy if exists "documents owner insert" on documents;
drop policy if exists "documents owner update" on documents;
drop policy if exists "documents owner delete" on documents;
create policy "documents owner select" on documents
  for select using (auth.uid() = user_id);
create policy "documents owner insert" on documents
  for insert with check (auth.uid() = user_id);
create policy "documents owner update" on documents
  for update using (auth.uid() = user_id);
create policy "documents owner delete" on documents
  for delete using (auth.uid() = user_id);

-- Helpers ------------------------------------------------------------------

create or replace function public.utf8_bytes(p_text text)
returns bigint
language sql
immutable
as $$
  select octet_length(convert_to(coalesce(p_text, ''), 'UTF8'))::bigint;
$$;

create or replace function public.recompute_used_bytes(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update user_settings
  set
    used_bytes = coalesce((
      select sum(size_bytes)::bigint from documents where user_id = p_user_id
    ), 0),
    updated_at = now()
  where user_id = p_user_id;
end;
$$;

-- Bootstrap default IDE tree for the current user.
create or replace function public.ensure_default_workspace()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  essays_id uuid;
  drafts_id uuid;
  scratch_id uuid;
  scratch_md text := $md$---
title: Scratchpad
status: draft
---
# Scratchpad

Quick notes land here. Persistence is live — edits autosave locally, then sync to Supabase.
$md$;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into user_settings (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  select id into essays_id
  from workspace_nodes
  where user_id = uid and parent_id is null and kind = 'folder' and name = 'essays'
  limit 1;

  if essays_id is null then
    insert into workspace_nodes (user_id, parent_id, kind, name, position)
    values (uid, null, 'folder', 'essays', 0)
    returning id into essays_id;
  end if;

  select id into drafts_id
  from workspace_nodes
  where user_id = uid and parent_id is null and kind = 'folder' and name = 'drafts'
  limit 1;

  if drafts_id is null then
    insert into workspace_nodes (user_id, parent_id, kind, name, position)
    values (uid, null, 'folder', 'drafts', 1)
    returning id into drafts_id;
  end if;

  select id into scratch_id
  from workspace_nodes
  where user_id = uid and parent_id is null and kind = 'document' and name = 'scratchpad.md'
  limit 1;

  if scratch_id is null then
    insert into workspace_nodes (user_id, parent_id, kind, name, position, pinned)
    values (uid, null, 'document', 'scratchpad.md', 2, true)
    returning id into scratch_id;

    insert into documents (node_id, user_id, markdown, status, version, size_bytes)
    values (
      scratch_id,
      uid,
      scratch_md,
      'draft',
      1,
      public.utf8_bytes(scratch_md)
    );
  end if;

  perform public.recompute_used_bytes(uid);

  return jsonb_build_object(
    'essaysId', essays_id,
    'draftsId', drafts_id,
    'scratchpadId', scratch_id
  );
end;
$$;

revoke all on function public.ensure_default_workspace() from public;
grant execute on function public.ensure_default_workspace() to authenticated;

-- Create a folder, document, or link under the current user.
create or replace function public.create_workspace_node(
  p_kind text,
  p_name text,
  p_parent_id uuid default null,
  p_markdown text default '',
  p_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  next_pos integer;
  md text := coalesce(p_markdown, '');
  bytes bigint;
  settings user_settings%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_kind not in ('folder', 'document', 'link') then
    raise exception 'Invalid kind';
  end if;
  if p_parent_id is not null and not exists (
    select 1 from workspace_nodes
    where id = p_parent_id and user_id = uid and kind = 'folder'
  ) then
    raise exception 'Invalid parent';
  end if;

  select * into settings from user_settings where user_id = uid;
  if not found then
    insert into user_settings (user_id) values (uid)
    returning * into settings;
  end if;

  if p_kind = 'document' then
    bytes := public.utf8_bytes(md);
    if settings.used_bytes + bytes > settings.quota_bytes then
      raise exception 'Quota exceeded';
    end if;
  end if;

  select coalesce(max(position), -1) + 1 into next_pos
  from workspace_nodes
  where user_id = uid and parent_id is not distinct from p_parent_id;

  insert into workspace_nodes (user_id, parent_id, kind, name, position, url)
  values (uid, p_parent_id, p_kind, p_name, next_pos, p_url)
  returning id into new_id;

  if p_kind = 'document' then
    insert into documents (node_id, user_id, markdown, version, size_bytes)
    values (new_id, uid, md, 1, bytes);
    perform public.recompute_used_bytes(uid);
  end if;

  return new_id;
end;
$$;

revoke all on function public.create_workspace_node(text, text, uuid, text, text) from public;
grant execute on function public.create_workspace_node(text, text, uuid, text, text) to authenticated;

-- Optimistic document save with quota accounting.
create or replace function public.save_document(
  p_node_id uuid,
  p_markdown text,
  p_base_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  doc documents%rowtype;
  new_bytes bigint;
  delta bigint;
  settings user_settings%rowtype;
  new_version bigint;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into doc
  from documents
  where node_id = p_node_id and user_id = uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if doc.version <> p_base_version then
    return jsonb_build_object(
      'ok', false,
      'reason', 'conflict',
      'remoteVersion', doc.version,
      'remoteMarkdown', doc.markdown
    );
  end if;

  select * into settings from user_settings where user_id = uid for update;
  if not found then
    insert into user_settings (user_id) values (uid)
    returning * into settings;
  end if;

  new_bytes := public.utf8_bytes(p_markdown);
  delta := new_bytes - doc.size_bytes;
  if settings.used_bytes + delta > settings.quota_bytes then
    return jsonb_build_object('ok', false, 'reason', 'quota');
  end if;

  new_version := doc.version + 1;

  update documents
  set
    markdown = p_markdown,
    version = new_version,
    size_bytes = new_bytes,
    updated_at = now()
  where node_id = p_node_id and user_id = uid;

  update workspace_nodes
  set updated_at = now()
  where id = p_node_id and user_id = uid;

  update user_settings
  set
    used_bytes = used_bytes + delta,
    updated_at = now()
  where user_id = uid;

  return jsonb_build_object(
    'ok', true,
    'version', new_version,
    'sizeBytes', new_bytes
  );
end;
$$;

revoke all on function public.save_document(uuid, text, bigint) from public;
grant execute on function public.save_document(uuid, text, bigint) to authenticated;

-- Seed example (run manually): insert into beta_codes (code) values ('WRITE-2026');
