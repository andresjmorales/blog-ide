-- Collaborative sharing, phase 1: per-person share links.
--
-- A share grants one invitee (by email) a role on one essay. The link
-- carries a random token; the first signed-in account whose email matches
-- claims the share, and from then on only that account can use it.
-- Signup does not verify email ownership (accounts are created with
-- email_confirm), so the token — not the email — is the secret.
--
-- Invitees never read `documents` directly. They go through
-- open_shared_document, which checks the share, refuses vault and
-- trashed essays, and returns the markdown.

create table if not exists document_shares (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references workspace_nodes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  grantee_email text not null,
  grantee_id uuid references auth.users(id) on delete set null,
  role text not null default 'commenter',
  token text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz,
  constraint document_shares_role_check
    check (role in ('viewer', 'commenter', 'suggester')),
  constraint document_shares_email_check
    check (
      grantee_email = lower(btrim(grantee_email))
      and grantee_email ~ '^[^@\s]+@[^@\s]+$'
    ),
  constraint document_shares_node_email_key unique (node_id, grantee_email),
  constraint document_shares_token_key unique (token)
);

create index if not exists document_shares_owner_idx
  on document_shares (owner_id, node_id);
create index if not exists document_shares_grantee_idx
  on document_shares (grantee_id)
  where grantee_id is not null;

alter table document_shares enable row level security;

drop policy if exists "document_shares owner select" on document_shares;
create policy "document_shares owner select" on document_shares
  for select using (auth.uid() = owner_id);

-- Writes go through the RPCs below (ownership, vault, and cap checks).
revoke all on document_shares from anon, authenticated;
grant select on document_shares to authenticated;

-- True when the node sits anywhere under the user's Trash section.
create or replace function public.node_in_trash(p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive up as (
    select id, parent_id, system_key
    from workspace_nodes
    where id = p_node_id
    union all
    select w.id, w.parent_id, w.system_key
    from workspace_nodes w
    join up on w.id = up.parent_id
  )
  select exists (select 1 from up where system_key = 'trash');
$$;

revoke all on function public.node_in_trash(uuid) from public, anon, authenticated;

-- Display name for share lists and the viewer header (never the password
-- or other metadata).
create or replace function public.user_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
    split_part(u.email, '@', 1)
  )
  from auth.users u
  where u.id = p_user_id;
$$;

revoke all on function public.user_display_name(uuid) from public, anon, authenticated;

create or replace function public.share_document(
  p_node_id uuid,
  p_email text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  email_norm text := lower(btrim(coalesce(p_email, '')));
  owner_email text;
  doc_enc smallint;
  share_count integer;
  saved document_shares;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_role not in ('viewer', 'commenter', 'suggester') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_role');
  end if;
  if email_norm !~ '^[^@\s]+@[^@\s]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;

  select d.enc into doc_enc
  from documents d
  join workspace_nodes n on n.id = d.node_id
  where d.node_id = p_node_id
    and d.user_id = uid
    and n.kind = 'document';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if doc_enc <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'vault');
  end if;
  if public.node_in_trash(p_node_id) then
    return jsonb_build_object('ok', false, 'reason', 'trashed');
  end if;

  select lower(email) into owner_email from auth.users where id = uid;
  if owner_email = email_norm then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;

  select count(*) into share_count
  from document_shares
  where node_id = p_node_id and grantee_email <> email_norm;
  if share_count >= 50 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  insert into document_shares (node_id, owner_id, grantee_email, role)
  values (p_node_id, uid, email_norm, p_role)
  on conflict (node_id, grantee_email)
  do update set role = excluded.role, updated_at = now()
  returning * into saved;

  return jsonb_build_object('ok', true, 'id', saved.id, 'token', saved.token);
end;
$$;

revoke all on function public.share_document(uuid, text, text) from public;
grant execute on function public.share_document(uuid, text, text) to authenticated;

create or replace function public.update_document_share(
  p_share_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_role not in ('viewer', 'commenter', 'suggester') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_role');
  end if;
  update document_shares
  set role = p_role, updated_at = now()
  where id = p_share_id and owner_id = uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.update_document_share(uuid, text) from public;
grant execute on function public.update_document_share(uuid, text) to authenticated;

-- Owner removes a share, or an invitee leaves one they claimed.
create or replace function public.revoke_document_share(p_share_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  delete from document_shares
  where id = p_share_id and (owner_id = uid or grantee_id = uid);
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.revoke_document_share(uuid) from public;
grant execute on function public.revoke_document_share(uuid) to authenticated;

-- Fresh token: old links stop working (e.g. a forwarded invite).
create or replace function public.reset_document_share_link(p_share_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  next_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  update document_shares
  set token = next_token, grantee_id = null, updated_at = now()
  where id = p_share_id and owner_id = uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'token', next_token);
end;
$$;

revoke all on function public.reset_document_share_link(uuid) from public;
grant execute on function public.reset_document_share_link(uuid) to authenticated;

-- Invitee opens a share link. Claims an unclaimed share for the signed-in
-- account when its email matches; afterwards only that account may use it.
create or replace function public.open_shared_document(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  my_email text;
  share document_shares;
  doc documents;
  node_name text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into share from document_shares where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if share.owner_id = uid then
    return jsonb_build_object('ok', false, 'reason', 'owner', 'node_id', share.node_id);
  end if;

  if share.grantee_id is null then
    select lower(email) into my_email from auth.users where id = uid;
    if my_email is distinct from share.grantee_email then
      return jsonb_build_object(
        'ok', false,
        'reason', 'wrong_account',
        'invited_email', share.grantee_email
      );
    end if;
    update document_shares set grantee_id = uid where id = share.id;
  elsif share.grantee_id <> uid then
    return jsonb_build_object('ok', false, 'reason', 'claimed');
  end if;

  select * into doc
  from documents
  where node_id = share.node_id and user_id = share.owner_id;
  if not found or public.node_in_trash(share.node_id) then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;
  if doc.enc <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'unavailable');
  end if;

  select name into node_name from workspace_nodes where id = share.node_id;

  update document_shares set last_opened_at = now() where id = share.id;

  return jsonb_build_object(
    'ok', true,
    'share_id', share.id,
    'node_id', share.node_id,
    'role', share.role,
    'name', node_name,
    'markdown', doc.markdown,
    'version', doc.version,
    'updated_at', doc.updated_at,
    'owner_id', share.owner_id,
    'owner_name', public.user_display_name(share.owner_id)
  );
end;
$$;

revoke all on function public.open_shared_document(text) from public;
grant execute on function public.open_shared_document(text) to authenticated;

-- Essays shared with the signed-in account (claimed shares only).
create or replace function public.list_shared_with_me()
returns table (
  share_id uuid,
  token text,
  node_id uuid,
  role text,
  name text,
  owner_name text,
  updated_at timestamptz,
  last_opened_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.token,
    s.node_id,
    s.role,
    n.name,
    public.user_display_name(s.owner_id),
    d.updated_at,
    s.last_opened_at
  from document_shares s
  join workspace_nodes n on n.id = s.node_id
  join documents d on d.node_id = s.node_id
  where s.grantee_id = auth.uid()
    and d.enc = 0
    and not public.node_in_trash(s.node_id)
  order by d.updated_at desc nulls last;
$$;

revoke all on function public.list_shared_with_me() from public;
grant execute on function public.list_shared_with_me() to authenticated;

-- Signup route (service role): may this email skip the beta code because it
-- holds an unclaimed invite with this token?
create or replace function public.share_invite_allows_signup(
  p_token text,
  p_email text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from document_shares
    where token = p_token
      and grantee_id is null
      and grantee_email = lower(btrim(p_email))
  );
$$;

revoke all on function public.share_invite_allows_signup(text, text) from public, anon, authenticated;
