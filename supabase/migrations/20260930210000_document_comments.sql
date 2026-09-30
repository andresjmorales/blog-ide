-- Collaborative sharing, phase 2: comment threads on shared essays.
--
-- Comments live beside the essay, never in its markdown. A thread root
-- carries a text-quote anchor (see lib/comments/anchors.ts); replies point
-- at their root through thread_id. Everything goes through the definer RPCs
-- below, which accept the owner or a claimed share. Viewers can read
-- threads; commenters and suggesters can also write. Vault and trashed
-- essays are refused, same as open_shared_document.

create table if not exists document_comments (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references workspace_nodes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references document_comments(id) on delete cascade,
  kind text not null default 'comment',
  anchor jsonb,
  body text not null,
  suggestion jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  constraint document_comments_kind_check
    check (kind in ('comment', 'suggestion')),
  constraint document_comments_status_check
    check (status in ('open', 'resolved', 'accepted', 'rejected')),
  constraint document_comments_body_check
    check (char_length(body) between 1 and 5000),
  constraint document_comments_root_anchor_check
    check ((thread_id is null) = (anchor is not null))
);

create index if not exists document_comments_node_idx
  on document_comments (node_id, created_at);
create index if not exists document_comments_thread_idx
  on document_comments (thread_id)
  where thread_id is not null;

alter table document_comments enable row level security;

drop policy if exists "document_comments owner select" on document_comments;
create policy "document_comments owner select" on document_comments
  for select using (auth.uid() = owner_id);

-- Writes (and invitee reads) go through the RPCs below.
revoke all on document_comments from anon, authenticated;
grant select on document_comments to authenticated;

-- The caller's access to an essay's comments: 'owner', the claimed share's
-- role, or null. Vault, trashed, and missing essays give null.
create or replace function public.document_comment_access(p_node_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  doc_owner uuid;
  doc_enc smallint;
  share_role text;
begin
  if uid is null then
    return null;
  end if;
  select d.user_id, d.enc into doc_owner, doc_enc
  from documents d
  where d.node_id = p_node_id;
  if not found or doc_enc <> 0 or public.node_in_trash(p_node_id) then
    return null;
  end if;
  if doc_owner = uid then
    return 'owner';
  end if;
  select s.role into share_role
  from document_shares s
  where s.node_id = p_node_id and s.grantee_id = uid;
  return share_role;
end;
$$;

revoke all on function public.document_comment_access(uuid) from public, anon, authenticated;

-- Anchor shape check (the client builds anchors; the server only bounds
-- them so a row can't carry arbitrary payloads).
create or replace function public.document_comment_anchor_ok(p_anchor jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    jsonb_typeof(p_anchor) = 'object'
    and p_anchor ->> 'scope' in ('body', 'footnote')
    and (
      p_anchor ->> 'scope' = 'body'
      or char_length(coalesce(p_anchor ->> 'footnoteId', '')) between 1 and 200
    )
    and char_length(coalesce(p_anchor ->> 'quote', '')) between 1 and 2000
    and char_length(coalesce(p_anchor ->> 'prefix', '')) <= 200
    and char_length(coalesce(p_anchor ->> 'suffix', '')) <= 200
    and jsonb_typeof(coalesce(p_anchor -> 'hint', '0'::jsonb)) = 'number'
    and pg_column_size(p_anchor) <= 8192;
$$;

revoke all on function public.document_comment_anchor_ok(jsonb) from public, anon, authenticated;

create or replace function public.list_document_comments(p_node_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  access text := public.document_comment_access(p_node_id);
  rows jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if access is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'thread_id', c.thread_id,
    'author_id', c.author_id,
    'author_name', public.user_display_name(c.author_id),
    'kind', c.kind,
    'anchor', c.anchor,
    'body', c.body,
    'status', c.status,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'resolved_at', c.resolved_at,
    'resolved_by', c.resolved_by
  ) order by c.created_at, c.id), '[]'::jsonb)
  into rows
  from document_comments c
  where c.node_id = p_node_id;

  return jsonb_build_object(
    'ok', true,
    'access', access,
    'me', auth.uid(),
    'comments', rows
  );
end;
$$;

revoke all on function public.list_document_comments(uuid) from public;
grant execute on function public.list_document_comments(uuid) to authenticated;

create or replace function public.add_document_comment(
  p_node_id uuid,
  p_anchor jsonb,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  access text := public.document_comment_access(p_node_id);
  body_trim text := btrim(coalesce(p_body, ''));
  doc_owner uuid;
  thread_count integer;
  saved document_comments;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if access is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if access not in ('owner', 'commenter', 'suggester') then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if char_length(body_trim) not between 1 and 5000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_body');
  end if;
  if not public.document_comment_anchor_ok(p_anchor) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_anchor');
  end if;

  select count(*) into thread_count
  from document_comments
  where node_id = p_node_id and thread_id is null;
  if thread_count >= 500 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  select user_id into doc_owner from documents where node_id = p_node_id;

  insert into document_comments (node_id, owner_id, author_id, anchor, body)
  values (p_node_id, doc_owner, uid, p_anchor, body_trim)
  returning * into saved;

  return jsonb_build_object('ok', true, 'id', saved.id, 'created_at', saved.created_at);
end;
$$;

revoke all on function public.add_document_comment(uuid, jsonb, text) from public;
grant execute on function public.add_document_comment(uuid, jsonb, text) to authenticated;

create or replace function public.reply_to_comment(
  p_thread_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  root document_comments;
  access text;
  body_trim text := btrim(coalesce(p_body, ''));
  reply_count integer;
  saved document_comments;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  select * into root
  from document_comments
  where id = p_thread_id and thread_id is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  access := public.document_comment_access(root.node_id);
  if access is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if access not in ('owner', 'commenter', 'suggester') then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if char_length(body_trim) not between 1 and 5000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_body');
  end if;

  select count(*) into reply_count
  from document_comments
  where thread_id = p_thread_id;
  if reply_count >= 200 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  insert into document_comments (node_id, owner_id, author_id, thread_id, body)
  values (root.node_id, root.owner_id, uid, root.id, body_trim)
  returning * into saved;

  update document_comments set updated_at = now() where id = root.id;

  return jsonb_build_object('ok', true, 'id', saved.id, 'created_at', saved.created_at);
end;
$$;

revoke all on function public.reply_to_comment(uuid, text) from public;
grant execute on function public.reply_to_comment(uuid, text) to authenticated;

-- Authors edit their own words while they still have write access.
create or replace function public.edit_comment(
  p_comment_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  target document_comments;
  access text;
  body_trim text := btrim(coalesce(p_body, ''));
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  select * into target from document_comments where id = p_comment_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  access := public.document_comment_access(target.node_id);
  if access is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if target.author_id <> uid
    or access not in ('owner', 'commenter', 'suggester') then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if char_length(body_trim) not between 1 and 5000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_body');
  end if;
  update document_comments
  set body = body_trim, updated_at = now()
  where id = p_comment_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.edit_comment(uuid, text) from public;
grant execute on function public.edit_comment(uuid, text) to authenticated;

-- Authors delete their own comment. Deleting a thread root removes its
-- replies (thread_id cascades).
create or replace function public.delete_comment(p_comment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  target document_comments;
  access text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  select * into target from document_comments where id = p_comment_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  access := public.document_comment_access(target.node_id);
  if access is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if target.author_id <> uid
    or access not in ('owner', 'commenter', 'suggester') then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  delete from document_comments where id = p_comment_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.delete_comment(uuid) from public;
grant execute on function public.delete_comment(uuid) to authenticated;

-- Resolve or reopen a thread: the essay owner, or the thread's author while
-- they still have write access.
create or replace function public.set_thread_status(
  p_thread_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  root document_comments;
  access text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_status not in ('open', 'resolved') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_status');
  end if;
  select * into root
  from document_comments
  where id = p_thread_id and thread_id is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  access := public.document_comment_access(root.node_id);
  if access is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not (
    access = 'owner'
    or (root.author_id = uid and access in ('commenter', 'suggester'))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  update document_comments
  set status = p_status,
      resolved_at = case when p_status = 'resolved' then now() else null end,
      resolved_by = case when p_status = 'resolved' then uid else null end,
      updated_at = now()
  where id = p_thread_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_thread_status(uuid, text) from public;
grant execute on function public.set_thread_status(uuid, text) to authenticated;

-- People whose names and photos a participant may see on this essay: the
-- owner, everyone with a claimed share, and every comment author. Empty
-- for callers without access. The avatar route signs photos only for these.
create or replace function public.document_comment_participants(p_node_id uuid)
returns table (user_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.document_comment_access(p_node_id) is null then
    return;
  end if;
  return query
  with people as (
    select d.user_id as id from documents d where d.node_id = p_node_id
    union
    select s.grantee_id from document_shares s
    where s.node_id = p_node_id and s.grantee_id is not null
    union
    select c.author_id from document_comments c where c.node_id = p_node_id
  )
  select p.id, public.user_display_name(p.id) from people p;
end;
$$;

revoke all on function public.document_comment_participants(uuid) from public;
grant execute on function public.document_comment_participants(uuid) to authenticated;
