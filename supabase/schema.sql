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
  quota_bytes bigint not null default 20971520,
  updated_at timestamptz default now()
);

-- Additive columns for projects created before M3.
alter table user_settings add column if not exists used_bytes bigint not null default 0;
alter table user_settings add column if not exists quota_bytes bigint not null default 20971520;
alter table user_settings alter column quota_bytes set default 20971520;
update user_settings set quota_bytes = 20971520 where quota_bytes = 209715200;

create table if not exists workspace_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references workspace_nodes(id) on delete cascade,
  kind text not null check (kind in ('folder', 'document', 'link')),
  name text not null,
  position integer not null default 0,
  url text,
  pinned boolean not null default false,
  system_key text,
  color text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Additive for projects created before Trash support.
alter table workspace_nodes add column if not exists system_key text;
alter table workspace_nodes add column if not exists color text;

create unique index if not exists workspace_nodes_user_system_key_uidx
  on workspace_nodes (user_id, system_key)
  where system_key is not null;

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

-- Snapshot of each replaced document version (last 20 kept per document).
-- Written only by definer RPCs; excluded from quota accounting.
create table if not exists document_revisions (
  node_id uuid not null references workspace_nodes(id) on delete cascade,
  version bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  markdown text not null,
  created_at timestamptz not null default now(),
  primary key (node_id, version)
);

create index if not exists document_revisions_user_idx
  on document_revisions (user_id);

-- Drop obsolete stub from M1 if present.
drop table if exists doc_index;

-- Row Level Security -------------------------------------------------------

alter table beta_codes enable row level security;
alter table user_settings enable row level security;
alter table workspace_nodes enable row level security;
alter table documents enable row level security;
alter table document_revisions enable row level security;

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

drop policy if exists "document_revisions owner select" on document_revisions;
create policy "document_revisions owner select" on document_revisions
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: revisions are written only by definer RPCs.

-- Grants: RLS scopes rows, but these grants force writes that carry
-- invariants (versioning, quota, tree integrity) through the RPCs below.
revoke all on document_revisions from anon, authenticated;
grant select on document_revisions to authenticated;

revoke insert, update, delete on documents from anon, authenticated;

revoke insert, update on user_settings from anon, authenticated;
grant insert (user_id, github_repo, github_branch, editor_prefs, updated_at)
  on user_settings to authenticated;
grant update (user_id, github_repo, github_branch, editor_prefs, updated_at)
  on user_settings to authenticated;

revoke insert, update, delete on workspace_nodes from anon, authenticated;
grant update (name, url, pinned, color, updated_at)
  on workspace_nodes to authenticated;

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
    ), 0)
    + coalesce((
      select sum(byte_size)::bigint from user_assets where user_id = p_user_id
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
  is_fresh boolean;
  essays_id uuid;
  drafts_id uuid;
  scratch_id uuid;
  welcome_id uuid;
  inbox_id uuid;
  notes_id uuid;
  trash_id uuid;
  scratch_md text := $md$---
title: Scratchpad
status: draft
---
# Scratchpad

Quick notes land here. Persistence is live — edits autosave locally, then sync to Supabase.
$md$;
  notes_md text := $md$---
title: General
status: draft
---

$md$;
  welcome_md text := $md$---
title: Welcome to BlogIDE
subtitle: A quick tour of your writing workspace
author:
date:
description:
tags:
canonical:
---

BlogIDE is a local-first writing IDE for essays that publish as clean markdown. Everything you type autosaves to this browser instantly and syncs to the cloud a moment later — watch the check mark next to your avatar. This page is a regular essay: edit it, or delete it from the Files panel when you're done.

## The panels

The **Files** panel (left) is your workspace tree. Hover a folder for quick-create buttons, right-click (or use the ⋯ kebab) for rename, move, pin, and Trash. Pinned items stay at the top. Every panel tab can be dragged between the left and right docks, popped out into a floating window, or closed — reopen them from the panels menu in the header.

## Writing

The editor is rich text over pure markdown — switch to **View raw markdown** from the ⋯ menu in the toolbar any time; nothing is lost in either direction. The **Outline** rail (left edge of the essay) tracks your headings. The **Footnotes** rail (right edge) collects every footnote beside the essay; collapse it when you want a clean page. Insert footnotes with Ctrl+Shift+F.

A few constructs you can try right here:

- Bullet one
- Bullet two

```ts
const greeting = "hello, BlogIDE";
```

---

| Feature | Shortcut |
| --- | --- |
| Footnote | Ctrl+Shift+F |
| Link | Ctrl+K |

Inline math works too: $x^2$.

## Research while you write

Paste a link and hover it for a live page preview. Pin a PDF from the **Library** panel to float it over the workspace while you quote from it. Images paste straight in — they're compressed and uploaded automatically.

## Notes

The **Notes** panel (Shell) is a capture stream for notes-to-self: type a thought, it lands timestamped in a channel document under the Notes folder (default `general`). On your phone, BlogIDE opens straight into capture mode so you can push notes from anywhere.

## Safety net

Every cloud save keeps the previous version — **Version history** in the ⋯ menu lists the last 20 snapshots of each essay with one-click restore. Deletes go to the Trash first. **Export all (.zip)** in the Files panel downloads your whole workspace as portable markdown.

Happy writing.
$md$;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select not exists (
    select 1 from workspace_nodes where user_id = uid
  ) into is_fresh;

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
  where user_id = uid and system_key = 'scratchpad'
  limit 1;

  if scratch_id is null then
    -- Claim a legacy scratchpad from before system_key existed (prefer the
    -- pinned bootstrap row; fall back to the old name-based match so
    -- existing installs keep their scratchpad instead of growing a second).
    select id into scratch_id
    from workspace_nodes
    where user_id = uid and parent_id is null and kind = 'document'
      and lower(name) = 'scratchpad.md'
    order by pinned desc, created_at asc
    limit 1;

    if scratch_id is not null then
      update workspace_nodes
      set system_key = 'scratchpad', pinned = true
      where id = scratch_id;
    end if;
  end if;

  if scratch_id is null then
    insert into workspace_nodes (user_id, parent_id, kind, name, position, pinned, system_key)
    values (uid, null, 'document', 'scratchpad.md', 2, true, 'scratchpad')
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

  -- Fresh users get a deletable feature tour (never re-created afterwards).
  if is_fresh then
    insert into workspace_nodes (user_id, parent_id, kind, name, position)
    values (uid, null, 'document', 'welcome.md', 3)
    returning id into welcome_id;

    insert into documents (node_id, user_id, markdown, status, version, size_bytes)
    values (
      welcome_id,
      uid,
      welcome_md,
      'draft',
      1,
      public.utf8_bytes(welcome_md)
    );
  end if;

  select id into inbox_id
  from workspace_nodes
  where user_id = uid and system_key = 'inbox'
  limit 1;

  if inbox_id is null then
    insert into workspace_nodes (user_id, parent_id, kind, name, position, system_key)
    values (uid, null, 'folder', 'Notes', 90, 'inbox')
    returning id into inbox_id;
  end if;

  select id into notes_id
  from workspace_nodes
  where user_id = uid and parent_id = inbox_id and kind = 'document'
    and lower(name) in ('general.md', 'notes.md')
  order by case when lower(name) = 'general.md' then 0 else 1 end
  limit 1;

  if notes_id is null then
    insert into workspace_nodes (user_id, parent_id, kind, name, position)
    values (uid, inbox_id, 'document', 'general.md', 0)
    returning id into notes_id;

    insert into documents (node_id, user_id, markdown, status, version, size_bytes)
    values (
      notes_id,
      uid,
      notes_md,
      'draft',
      1,
      public.utf8_bytes(notes_md)
    );
  end if;

  select id into trash_id
  from workspace_nodes
  where user_id = uid and system_key = 'trash'
  limit 1;

  if trash_id is null then
    insert into workspace_nodes (user_id, parent_id, kind, name, position, system_key)
    values (uid, null, 'folder', 'Trash', 100, 'trash')
    returning id into trash_id;
  end if;

  perform public.recompute_used_bytes(uid);

  return jsonb_build_object(
    'essaysId', essays_id,
    'draftsId', drafts_id,
    'scratchpadId', scratch_id,
    'inboxId', inbox_id,
    'notesChannelId', notes_id,
    'trashId', trash_id
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

  -- Snapshot the version being replaced; keep the last 20 per document.
  insert into document_revisions (node_id, version, user_id, markdown)
  values (p_node_id, doc.version, uid, doc.markdown)
  on conflict (node_id, version) do nothing;

  delete from document_revisions
  where node_id = p_node_id and version <= doc.version - 20;

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

-- Restore a snapshot through save_document (quota + versioning + a snapshot
-- of the current content before it is replaced).
create or replace function public.restore_document_revision(
  p_node_id uuid,
  p_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur_version bigint;
  rev_markdown text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select version into cur_version
  from documents
  where node_id = p_node_id and user_id = uid;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select markdown into rev_markdown
  from document_revisions
  where node_id = p_node_id and user_id = uid and version = p_version;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'revision_not_found');
  end if;

  return public.save_document(p_node_id, rev_markdown, cur_version);
end;
$$;

revoke all on function public.restore_document_revision(uuid, bigint) from public;
grant execute on function public.restore_document_revision(uuid, bigint) to authenticated;

-- Move a node under a new parent (or to workspace root).
create or replace function public.move_workspace_node(
  p_node_id uuid,
  p_parent_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  node workspace_nodes%rowtype;
  next_pos integer;
  walk uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into node
  from workspace_nodes
  where id = p_node_id and user_id = uid
  for update;

  if not found then
    raise exception 'Node not found';
  end if;

  if node.system_key in ('trash', 'inbox', 'scratchpad') then
    raise exception 'Cannot move a system item';
  end if;

  if p_parent_id is not null then
    if not exists (
      select 1 from workspace_nodes
      where id = p_parent_id and user_id = uid and kind = 'folder'
    ) then
      raise exception 'Invalid parent';
    end if;

    -- Reject cycles: parent cannot be the node or one of its descendants.
    if p_parent_id = p_node_id then
      raise exception 'Cannot move a folder into itself';
    end if;

    walk := p_parent_id;
    while walk is not null loop
      if walk = p_node_id then
        raise exception 'Cannot move a folder into its descendant';
      end if;
      select parent_id into walk
      from workspace_nodes
      where id = walk and user_id = uid;
    end loop;
  end if;

  select coalesce(max(position), -1) + 1 into next_pos
  from workspace_nodes
  where user_id = uid and parent_id is not distinct from p_parent_id;

  update workspace_nodes
  set
    parent_id = p_parent_id,
    position = next_pos,
    updated_at = now()
  where id = p_node_id and user_id = uid;
end;
$$;

revoke all on function public.move_workspace_node(uuid, uuid) from public;
grant execute on function public.move_workspace_node(uuid, uuid) to authenticated;

-- Permanently delete a node (cascades children + documents) and recompute quota.
create or replace function public.delete_workspace_node(p_node_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  node workspace_nodes%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into node
  from workspace_nodes
  where id = p_node_id and user_id = uid
  for update;

  if not found then
    raise exception 'Node not found';
  end if;

  if node.system_key in ('trash', 'inbox', 'scratchpad') then
    raise exception 'Cannot delete a system item';
  end if;

  delete from workspace_nodes
  where id = p_node_id and user_id = uid;

  perform public.recompute_used_bytes(uid);
end;
$$;

revoke all on function public.delete_workspace_node(uuid) from public;
grant execute on function public.delete_workspace_node(uuid) to authenticated;

-- Storage inventory + Library (see migration 20260723220000_*) --------------

create table if not exists user_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  byte_size bigint not null check (byte_size >= 0),
  content_type text not null default 'application/octet-stream',
  kind text not null check (kind in ('essay_image', 'library_pdf')),
  node_id uuid references workspace_nodes(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, path)
);

create index if not exists user_assets_user_id_idx on user_assets (user_id);

alter table user_assets enable row level security;
drop policy if exists "user_assets owner select" on user_assets;
create policy "user_assets owner select" on user_assets
  for select using (auth.uid() = user_id);
revoke insert, update, delete on user_assets from anon, authenticated;
grant select on user_assets to authenticated;

create table if not exists library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('pdf', 'link')),
  title text not null,
  url text,
  asset_path text,
  byte_size bigint not null default 0 check (byte_size >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_items_user_id_idx on library_items (user_id);
create unique index if not exists library_items_user_link_url_uidx
  on library_items (user_id, url)
  where kind = 'link' and url is not null;

alter table library_items enable row level security;
drop policy if exists "library_items owner select" on library_items;
drop policy if exists "library_items owner insert" on library_items;
drop policy if exists "library_items owner update" on library_items;
drop policy if exists "library_items owner delete" on library_items;
create policy "library_items owner select" on library_items
  for select using (auth.uid() = user_id);
create policy "library_items owner insert" on library_items
  for insert with check (auth.uid() = user_id);
create policy "library_items owner update" on library_items
  for update using (auth.uid() = user_id);
create policy "library_items owner delete" on library_items
  for delete using (auth.uid() = user_id);
grant select, insert, update, delete on library_items to authenticated;

create or replace function public.register_user_asset(
  p_path text,
  p_byte_size bigint,
  p_content_type text,
  p_kind text,
  p_node_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  settings user_settings%rowtype;
  prefix text;
  old_bytes bigint := 0;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_path is null or length(trim(p_path)) = 0 then
    raise exception 'path required';
  end if;
  if p_byte_size is null or p_byte_size < 0 then
    raise exception 'byte_size must be >= 0';
  end if;
  if p_kind not in ('essay_image', 'library_pdf') then
    raise exception 'invalid kind';
  end if;
  prefix := uid::text || '/';
  if position(prefix in p_path) <> 1 then
    raise exception 'path must be under the user prefix';
  end if;

  insert into user_settings (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  select * into settings from user_settings where user_id = uid for update;

  select byte_size into old_bytes
  from user_assets where user_id = uid and path = p_path;
  old_bytes := coalesce(old_bytes, 0);

  if settings.used_bytes - old_bytes + p_byte_size > settings.quota_bytes then
    return jsonb_build_object('ok', false, 'reason', 'quota');
  end if;

  insert into user_assets (user_id, path, byte_size, content_type, kind, node_id)
  values (
    uid, p_path, p_byte_size,
    coalesce(nullif(trim(p_content_type), ''), 'application/octet-stream'),
    p_kind, p_node_id
  )
  on conflict (user_id, path) do update
  set
    byte_size = excluded.byte_size,
    content_type = excluded.content_type,
    kind = excluded.kind,
    node_id = coalesce(excluded.node_id, user_assets.node_id);

  perform public.recompute_used_bytes(uid);
  return jsonb_build_object('ok', true, 'path', p_path);
end;
$$;

revoke all on function public.register_user_asset(text, bigint, text, text, uuid) from public;
grant execute on function public.register_user_asset(text, bigint, text, text, uuid) to authenticated;

create or replace function public.release_asset_path(p_path text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  removed bigint := 0;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from user_assets
  where user_id = uid and path = p_path
  returning byte_size into removed;

  if removed is null then
    return jsonb_build_object('ok', true, 'released', 0);
  end if;

  perform public.recompute_used_bytes(uid);
  return jsonb_build_object('ok', true, 'released', removed);
end;
$$;

revoke all on function public.release_asset_path(text) from public;
grant execute on function public.release_asset_path(text) to authenticated;

-- Seed example (run manually): insert into beta_codes (code) values ('WRITE-2026');
