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
  github_path text,              -- default prefix in the repo (e.g. content/essays)
  github_maps jsonb not null default '[]'::jsonb, -- folder/document → repo/path
  -- NOTE: GitHub token and Anthropic key are NOT stored here (spec §8).
  editor_prefs jsonb default '{}',
  used_bytes bigint not null default 0,
  quota_bytes bigint not null default 10485760,
  plan text not null default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_subscription_status text,
  stripe_cancel_at timestamptz,
  updated_at timestamptz default now()
);

-- Additive columns for projects created before M3.
alter table user_settings add column if not exists used_bytes bigint not null default 0;
alter table user_settings add column if not exists quota_bytes bigint not null default 10485760;
alter table user_settings alter column quota_bytes set default 10485760;
-- Legacy free defaults: 200 MiB → 20 MiB → 10 MiB.
update user_settings set quota_bytes = 10485760 where quota_bytes = 209715200;
update user_settings
set quota_bytes = 10485760
where quota_bytes = 20971520 and coalesce(plan, 'free') = 'free';
alter table user_settings add column if not exists plan text not null default 'free';
alter table user_settings add column if not exists stripe_customer_id text;
alter table user_settings add column if not exists stripe_subscription_id text;
alter table user_settings add column if not exists stripe_subscription_status text;
alter table user_settings add column if not exists stripe_cancel_at timestamptz;
alter table user_settings add column if not exists github_path text;
alter table user_settings add column if not exists github_maps jsonb not null default '[]'::jsonb;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_plan_check'
  ) then
    alter table user_settings
      add constraint user_settings_plan_check
      check (plan in ('free', 'pro'));
  end if;
end $$;
create unique index if not exists user_settings_stripe_customer_id_uidx
  on user_settings (stripe_customer_id)
  where stripe_customer_id is not null;
create unique index if not exists user_settings_stripe_subscription_id_uidx
  on user_settings (stripe_subscription_id)
  where stripe_subscription_id is not null;

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
  conflict_of uuid
    constraint workspace_nodes_conflict_of_fkey
    references workspace_nodes(id) on delete set null,
  conflict_base_version bigint,
  conflict_key text,
  conflict_created_at timestamptz,
  conflict_resolved_at timestamptz,
  conflict_resolution text
    constraint workspace_nodes_conflict_resolution_check
    check (
      conflict_resolution is null
      or conflict_resolution in ('keep_cloud', 'use_mine', 'keep_both')
    ),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Additive for projects created before Trash support.
alter table workspace_nodes add column if not exists system_key text;
alter table workspace_nodes add column if not exists color text;
alter table workspace_nodes add column if not exists conflict_of uuid;
alter table workspace_nodes add column if not exists conflict_base_version bigint;
alter table workspace_nodes add column if not exists conflict_key text;
alter table workspace_nodes add column if not exists conflict_created_at timestamptz;
alter table workspace_nodes add column if not exists conflict_resolved_at timestamptz;
alter table workspace_nodes add column if not exists conflict_resolution text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.workspace_nodes'::regclass
      and conname = 'workspace_nodes_conflict_of_fkey'
  ) then
    alter table workspace_nodes
      add constraint workspace_nodes_conflict_of_fkey
      foreign key (conflict_of) references workspace_nodes(id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.workspace_nodes'::regclass
      and conname = 'workspace_nodes_conflict_resolution_check'
  ) then
    alter table workspace_nodes
      add constraint workspace_nodes_conflict_resolution_check
      check (
        conflict_resolution is null
        or conflict_resolution in ('keep_cloud', 'use_mine', 'keep_both')
      );
  end if;
end $$;

create unique index if not exists workspace_nodes_user_system_key_uidx
  on workspace_nodes (user_id, system_key)
  where system_key is not null;

create index if not exists workspace_nodes_user_parent_idx
  on workspace_nodes (user_id, parent_id, position);

-- Link legacy conflict copies only when their original is unambiguous.
do $$
declare
  candidate record;
  parsed_at timestamptz;
begin
  for candidate in
    select
      copy_node.id as copy_id,
      matched.origin_id,
      (name_match.parts)[2] as timestamp_text
    from workspace_nodes copy_node
    cross join lateral regexp_match(
      copy_node.name,
      '^(.*) \(conflict ([0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{2})\)\.md$'
    ) as name_match(parts)
    cross join lateral (
      select (array_agg(sibling.id))[1] as origin_id, count(*) as sibling_count
      from workspace_nodes sibling
      where sibling.user_id = copy_node.user_id
        and sibling.parent_id is not distinct from copy_node.parent_id
        and sibling.kind = 'document'
        and sibling.id <> copy_node.id
        and sibling.name = (name_match.parts)[1] || '.md'
    ) matched
    where copy_node.kind = 'document'
      and copy_node.conflict_of is null
      and copy_node.conflict_key is null
      and copy_node.conflict_resolved_at is null
      and matched.sibling_count = 1
  loop
    begin
      parsed_at := make_timestamptz(
        substring(candidate.timestamp_text from 1 for 4)::integer,
        substring(candidate.timestamp_text from 6 for 2)::integer,
        substring(candidate.timestamp_text from 9 for 2)::integer,
        substring(candidate.timestamp_text from 12 for 2)::integer,
        substring(candidate.timestamp_text from 15 for 2)::integer,
        substring(candidate.timestamp_text from 18 for 2)::double precision,
        'UTC'
      );
    exception when datetime_field_overflow or invalid_datetime_format then
      continue;
    end;

    update workspace_nodes
    set
      conflict_of = candidate.origin_id,
      conflict_key = 'legacy:' || md5(candidate.copy_id::text),
      conflict_created_at = parsed_at
    where id = candidate.copy_id
      and conflict_of is null
      and conflict_key is null;
  end loop;
end $$;

create unique index if not exists workspace_nodes_unresolved_conflict_key_uidx
  on workspace_nodes (user_id, conflict_of, conflict_key)
  where conflict_of is not null
    and conflict_key is not null
    and conflict_resolved_at is null;

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
grant insert (
  user_id,
  github_repo,
  github_branch,
  github_path,
  github_maps,
  editor_prefs,
  updated_at
)
  on user_settings to authenticated;
grant update (
  user_id,
  github_repo,
  github_branch,
  github_path,
  github_maps,
  editor_prefs,
  updated_at
)
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

Scraps and half-formed thoughts. This is a regular essay. Rename, move, or trash it like any other file.
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

BlogIDE is a local-first writing IDE for essays that publish as clean markdown. Everything you type autosaves to this browser instantly and syncs to the cloud a moment later. Watch the check mark next to your avatar.

This page is a regular essay. So is the pinned scratchpad.md next to it. Rename, move, unpin, or trash either of them whenever you want; the Files panel still has essays/, drafts/, Notes, and Trash.

## The panels

The **Files** panel (left) is your workspace tree. Hover a folder for quick-create buttons, or use New document to import `.md` / `.txt` / `.docx` (Word needs Pandoc on the server). Right-click (or the ⋯ kebab) for rename, move, pin, color, Trash, and optional GitHub map or push. Pinned items stay at the top. Changing an essay title also renames its file. Pop out any document to keep it floating while you write.

Every panel tab can be dragged between the left and right docks, popped out into a floating window, or closed. Reopen them from the panels menu in the header.

## Writing

The editor is rich text over pure markdown. Switch to **View raw markdown** from the ⋯ menu (or Ctrl+backslash) any time; nothing is lost in either direction. Title and subtitle sit above the essay; **Essay metadata** (the info control beside them) holds author, date, tags, and any extra frontmatter.

The **Outline** rail (left edge) tracks headings and live writing stats: words, reading time, characters. The **Footnotes** rail (right edge) collects every footnote beside the essay; collapse it when you want a clean page. Insert footnotes with Ctrl+Shift+F. Hover a note to preview, pin or drag a card to keep it on screen, and restore deleted notes from the bottom of the rail.

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
| Find | Ctrl+F |
| Markdown split | Ctrl+backslash |

Inline math works too: $x^2$.

Press **?** when you are not typing for the shortcut cheatsheet.

## Tools

The toolbar has more than formatting:

- **Find** (magnifying glass / Ctrl+F) searches the essay and footnote bodies. Regex and headings-only scopes live in the panel.
- **Cleanup** (broom) is a pinnable panel: Import (fix pasted footnotes), Text, Punctuation (Chicago/MLA dashes, smart quotes), and Publish (copy for Substack/Medium plus a link/image check).
- **Cc** converts case. **Cite** inserts a citation from BibTeX. **Ω** inserts special characters into the essay, title, or find field.
- **Essay settings** (⋯) turns writing check on or off for this essay. Harper runs on-device for English spelling and grammar.

## Research while you write

Paste a link and hover it for a live page preview, then Open, Pin, or save it to the **Library**. Pin a PDF from Library to float it over the workspace while you quote. Images paste or drag straight in; they are compressed and uploaded automatically. Select a figure to add alt text or a caption.

## Share and backup

⋯ → **Preview in new tab** shows publication-style HTML. **Copy all text** copies markdown; **Copy for** Substack or Medium pastes platform-specific footnote HTML. Download `.md`, or Word when Pandoc is installed. **Export all (.zip)** in the Files panel bundles your workspace and owned images. Optional GitHub backup (Account settings; the PAT stays on this device) is a one-way push. Supabase stays the source of truth.

## Notes

The **Notes** panel is a capture stream for notes-to-self: type a thought and it lands timestamped in a channel (default `general`). Manage channels from the Notes panel toolbar. On your phone, BlogIDE opens straight into capture mode.

## Optional AI

Paste an Anthropic or OpenAI key in Account settings (it stays on this device). The AI panel can critique, tighten, retitle, or expand a selection, then Apply a rewrite as a diff.

## Safety net

Every cloud save keeps the previous version. **Version history** in the ⋯ menu lists the last 20 snapshots of each essay with one-click restore. Deletes go to the Trash first. If two devices edit at once, BlogIDE keeps a conflict copy rather than dropping either version.

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
    -- Claim a legacy pinned root scratchpad.md from before system_key
    -- existed. Unpinned or nested files with that name are left alone.
    select id into scratch_id
    from workspace_nodes
    where user_id = uid and parent_id is null and kind = 'document'
      and pinned = true
      and lower(name) = 'scratchpad.md'
    order by created_at asc
    limit 1;

    if scratch_id is not null then
      update workspace_nodes
      set system_key = 'scratchpad'
      where id = scratch_id;
    end if;
  end if;

  -- Seed once for brand-new workspaces. Deleting it is permanent;
  -- essays/, drafts/, Notes, and Trash still keep the Files panel populated.
  if scratch_id is null and is_fresh then
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

  if node.system_key in ('trash', 'inbox') then
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

  if node.system_key in ('trash', 'inbox') then
    raise exception 'Cannot delete a system item';
  end if;

  delete from workspace_nodes
  where id = p_node_id and user_id = uid;

  perform public.recompute_used_bytes(uid);
end;
$$;

revoke all on function public.delete_workspace_node(uuid) from public;
grant execute on function public.delete_workspace_node(uuid) to authenticated;

-- Create an idempotent local-markdown conflict copy beside its cloud original.
create or replace function public.create_document_conflict_copy(
  p_origin_id uuid,
  p_base_version bigint,
  p_markdown text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  origin_node public.workspace_nodes%rowtype;
  settings public.user_settings%rowtype;
  copy_id uuid;
  copy_key text;
  copy_bytes bigint;
  copy_name text;
  next_pos integer;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_origin_id is null or p_base_version is null or p_base_version < 1
    or p_markdown is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  copy_key := pg_catalog.md5(
    p_origin_id::text || chr(31) || p_base_version::text || chr(31) || p_markdown
  );

  insert into public.user_settings (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  select * into settings
  from public.user_settings
  where user_id = uid
  for update;

  select node.* into origin_node
  from public.workspace_nodes node
  where node.id = p_origin_id
    and node.user_id = uid
    and node.kind = 'document'
    and exists (
      select 1
      from public.documents document
      where document.node_id = node.id
        and document.user_id = uid
    )
  for key share;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select id into copy_id
  from public.workspace_nodes
  where user_id = uid
    and conflict_of = p_origin_id
    and conflict_key = copy_key
    and conflict_resolved_at is null
  limit 1;

  if found then
    return jsonb_build_object('ok', true, 'copyId', copy_id, 'created', false);
  end if;

  copy_bytes := public.utf8_bytes(p_markdown);
  if settings.used_bytes + copy_bytes > settings.quota_bytes then
    return jsonb_build_object('ok', false, 'reason', 'quota');
  end if;

  select coalesce(max(position), -1) + 1 into next_pos
  from public.workspace_nodes
  where user_id = uid
    and parent_id is not distinct from origin_node.parent_id;

  copy_name :=
    regexp_replace(origin_node.name, '\.md$', '', 'i')
    || ' (conflict '
    || to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD-HH24-MI-SS')
    || ').md';

  begin
    insert into public.workspace_nodes (
      user_id,
      parent_id,
      kind,
      name,
      position,
      conflict_of,
      conflict_base_version,
      conflict_key,
      conflict_created_at
    )
    values (
      uid,
      origin_node.parent_id,
      'document',
      copy_name,
      next_pos,
      p_origin_id,
      p_base_version,
      copy_key,
      statement_timestamp()
    )
    returning id into copy_id;
  exception when unique_violation then
    select id into copy_id
    from public.workspace_nodes
    where user_id = uid
      and conflict_of = p_origin_id
      and conflict_key = copy_key
      and conflict_resolved_at is null
    limit 1;

    if found then
      return jsonb_build_object('ok', true, 'copyId', copy_id, 'created', false);
    end if;
    raise;
  end;

  insert into public.documents (
    node_id,
    user_id,
    markdown,
    version,
    size_bytes
  )
  values (copy_id, uid, p_markdown, 1, copy_bytes);

  update public.user_settings
  set
    used_bytes = used_bytes + copy_bytes,
    updated_at = statement_timestamp()
  where user_id = uid;

  return jsonb_build_object('ok', true, 'copyId', copy_id, 'created', true);
end;
$$;

revoke all on function public.create_document_conflict_copy(uuid, bigint, text) from public;
revoke all on function public.create_document_conflict_copy(uuid, bigint, text) from anon;
grant execute on function public.create_document_conflict_copy(uuid, bigint, text) to authenticated;

-- Resolve a conflict without discarding either body. Replaced cloud content is
-- retained in revisions, and discarded conflict copies are recoverable in Trash.
create or replace function public.resolve_document_conflict(
  p_copy_id uuid,
  p_resolution text,
  p_expected_origin_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  copy_node public.workspace_nodes%rowtype;
  copy_document public.documents%rowtype;
  origin_document public.documents%rowtype;
  save_result jsonb;
  trash_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_resolution is null
    or p_resolution not in ('keep_cloud', 'use_mine', 'keep_both') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_resolution');
  end if;

  if p_resolution = 'use_mine' and p_expected_origin_version is null then
    return jsonb_build_object('ok', false, 'reason', 'expected_version_required');
  end if;

  select * into copy_document
  from public.documents
  where node_id = p_copy_id
    and user_id = uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into copy_node
  from public.workspace_nodes
  where id = p_copy_id
    and user_id = uid
    and kind = 'document'
  for update;

  if not found or copy_node.conflict_of is null then
    return jsonb_build_object('ok', false, 'reason', 'not_conflict_copy');
  end if;

  if copy_node.conflict_resolved_at is not null
    or copy_node.conflict_resolution is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_resolved');
  end if;

  select document.* into origin_document
  from public.documents document
  where document.node_id = copy_node.conflict_of
    and document.user_id = uid
    and exists (
      select 1
      from public.workspace_nodes origin
      where origin.id = document.node_id
        and origin.user_id = uid
        and origin.kind = 'document'
    )
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'origin_not_found');
  end if;

  if p_resolution in ('keep_cloud', 'use_mine') then
    select id into trash_id
    from public.workspace_nodes
    where user_id = uid
      and system_key = 'trash'
      and kind = 'folder'
    limit 1;

    if trash_id is null then
      insert into public.workspace_nodes (
        user_id,
        parent_id,
        kind,
        name,
        position,
        system_key
      )
      values (uid, null, 'folder', 'Trash', 100, 'trash')
      on conflict (user_id, system_key) where system_key is not null do nothing;

      select id into trash_id
      from public.workspace_nodes
      where user_id = uid
        and system_key = 'trash'
        and kind = 'folder'
      limit 1;
    end if;

    if trash_id is null then
      return jsonb_build_object('ok', false, 'reason', 'trash_unavailable');
    end if;
  end if;

  if p_resolution = 'use_mine' then
    save_result := public.save_document(
      copy_node.conflict_of,
      copy_document.markdown,
      p_expected_origin_version
    );

    if not coalesce((save_result ->> 'ok')::boolean, false) then
      return save_result || jsonb_build_object('copyId', p_copy_id);
    end if;

    perform public.move_workspace_node(p_copy_id, trash_id);

    update public.workspace_nodes
    set
      conflict_resolution = p_resolution,
      conflict_resolved_at = statement_timestamp(),
      updated_at = statement_timestamp()
    where id = p_copy_id
      and user_id = uid;

    return save_result || jsonb_build_object(
      'copyId', p_copy_id,
      'originId', copy_node.conflict_of,
      'resolution', p_resolution
    );
  end if;

  if p_resolution = 'keep_cloud' then
    perform public.move_workspace_node(p_copy_id, trash_id);
  end if;

  update public.workspace_nodes
  set
    conflict_resolution = p_resolution,
    conflict_resolved_at = statement_timestamp(),
    updated_at = statement_timestamp()
  where id = p_copy_id
    and user_id = uid;

  return jsonb_build_object(
    'ok', true,
    'copyId', p_copy_id,
    'originId', copy_node.conflict_of,
    'resolution', p_resolution,
    'version', origin_document.version
  );
end;
$$;

revoke all on function public.resolve_document_conflict(uuid, text, bigint) from public;
revoke all on function public.resolve_document_conflict(uuid, text, bigint) from anon;
grant execute on function public.resolve_document_conflict(uuid, text, bigint) to authenticated;

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
