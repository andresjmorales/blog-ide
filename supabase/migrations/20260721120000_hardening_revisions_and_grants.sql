-- Hardening pass: document revision history, RPC-only document writes,
-- protected quota columns, and Storage upload limits.
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / idempotent grants).

-- 1) Revision history --------------------------------------------------------
-- Every successful save_document snapshots the version it replaced, so a bad
-- sync, serializer bug, or accidental wipe is recoverable for the last 20
-- versions of each document. Revisions do not count against the quota.

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

alter table document_revisions enable row level security;

drop policy if exists "document_revisions owner select" on document_revisions;
create policy "document_revisions owner select" on document_revisions
  for select using (auth.uid() = user_id);
-- No insert/update/delete policies: rows are written only by definer RPCs.

revoke all on document_revisions from anon, authenticated;
grant select on document_revisions to authenticated;

-- 2) save_document: snapshot the replaced version, keep the last 20 ----------

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

-- 3) Restore a revision (goes through save_document: quota, versioning,
--    and a snapshot of the current content before restoring).

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

-- 4) Lock down direct table writes -------------------------------------------
-- RLS already scopes rows to their owner, but direct PostgREST writes could
-- still bypass optimistic versioning and quota accounting (documents), or
-- rewrite quota counters (user_settings.used_bytes / quota_bytes). Force all
-- of those through the definer RPCs; keep only the columns the client
-- actually edits directly.

-- documents: reads stay client-side; every write goes through RPCs.
revoke insert, update, delete on documents from anon, authenticated;

-- user_settings: client may manage prefs and GitHub backup fields, never
-- quota accounting. (user_id stays grantable so PostgREST upserts work; RLS
-- pins it to auth.uid().)
revoke insert, update on user_settings from anon, authenticated;
grant insert (user_id, github_repo, github_branch, editor_prefs, updated_at)
  on user_settings to authenticated;
grant update (user_id, github_repo, github_branch, editor_prefs, updated_at)
  on user_settings to authenticated;

-- workspace_nodes: create/move/delete go through RPCs (position integrity,
-- cycle checks, system-folder protection). Direct updates only for rename,
-- link URL, and pin state.
revoke insert, update, delete on workspace_nodes from anon, authenticated;
grant update (name, url, pinned, updated_at)
  on workspace_nodes to authenticated;

-- 5) Storage: cap object size and restrict to image uploads ------------------
-- The image pipeline only emits webp/jpeg; png/gif tolerated for future paths.

update storage.buckets
set
  file_size_limit = 5242880, -- 5 MiB
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/gif']
where id = 'assets';
