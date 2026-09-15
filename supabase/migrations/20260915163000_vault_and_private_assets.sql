-- Private assets bucket + optional end-to-end encrypted vault folder.
-- Additive: a vault that is never created changes nothing for existing rows.

-- Phase 0: private assets. RLS on storage.objects already scopes by user
-- prefix; those policies only apply once the bucket is not public.
update storage.buckets
set public = false
where id = 'assets';

insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do update set public = excluded.public;

-- documents / revisions / nodes
alter table public.documents add column if not exists ciphertext bytea;
alter table public.documents add column if not exists enc smallint not null default 0;

alter table public.document_revisions add column if not exists ciphertext bytea;
alter table public.document_revisions add column if not exists enc smallint not null default 0;

alter table public.workspace_nodes add column if not exists name_enc bytea;
alter table public.workspace_nodes add column if not exists url_enc bytea;

create table if not exists public.user_vault (
  user_id uuid primary key references auth.users(id) on delete cascade,
  node_id uuid not null references public.workspace_nodes(id) on delete cascade,
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

alter table public.user_vault enable row level security;
drop policy if exists "user_vault owner select" on public.user_vault;
create policy "user_vault owner select" on public.user_vault
  for select using (auth.uid() = user_id);
revoke all on public.user_vault from public, anon, authenticated;
grant select on public.user_vault to authenticated;

-- save_document: extra defaulted params; byte accounting branches on enc.
drop function if exists public.save_document(uuid, text, bigint);

create function public.save_document(
  p_node_id uuid,
  p_markdown text,
  p_base_version bigint,
  p_ciphertext bytea default null,
  p_enc smallint default 0
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
  store_markdown text;
  store_cipher bytea;
  store_enc smallint;
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
      'remoteMarkdown', case when doc.enc = 1 then '' else doc.markdown end,
      'remoteEnc', doc.enc,
      'remoteCiphertext', encode(doc.ciphertext, 'hex')
    );
  end if;

  select * into settings from user_settings where user_id = uid for update;
  if not found then
    insert into user_settings (user_id) values (uid)
    returning * into settings;
  end if;

  store_enc := coalesce(p_enc, 0);
  if store_enc = 1 then
    if p_ciphertext is null then
      return jsonb_build_object('ok', false, 'reason', 'invalid_input');
    end if;
    store_markdown := '';
    store_cipher := p_ciphertext;
    new_bytes := pg_catalog.octet_length(p_ciphertext)::bigint;
  else
    store_markdown := coalesce(p_markdown, '');
    store_cipher := null;
    new_bytes := public.utf8_bytes(store_markdown);
  end if;

  delta := new_bytes - doc.size_bytes;
  if settings.used_bytes + delta > settings.quota_bytes then
    return jsonb_build_object('ok', false, 'reason', 'quota');
  end if;

  new_version := doc.version + 1;

  insert into document_revisions (node_id, version, user_id, markdown, ciphertext, enc)
  values (p_node_id, doc.version, uid, doc.markdown, doc.ciphertext, doc.enc)
  on conflict (node_id, version) do nothing;

  delete from document_revisions
  where node_id = p_node_id and version <= doc.version - 20;

  update documents
  set
    markdown = store_markdown,
    ciphertext = store_cipher,
    enc = store_enc,
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

revoke all on function public.save_document(uuid, text, bigint, bytea, smallint) from public;
grant execute on function public.save_document(uuid, text, bigint, bytea, smallint) to authenticated;

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
  rev_cipher bytea;
  rev_enc smallint;
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

  select markdown, ciphertext, enc
    into rev_markdown, rev_cipher, rev_enc
  from document_revisions
  where node_id = p_node_id and user_id = uid and version = p_version;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'revision_not_found');
  end if;

  return public.save_document(
    p_node_id,
    coalesce(rev_markdown, ''),
    cur_version,
    rev_cipher,
    coalesce(rev_enc, 0)
  );
end;
$$;

drop function if exists public.create_workspace_node(text, text, uuid, text, text);

create function public.create_workspace_node(
  p_kind text,
  p_name text,
  p_parent_id uuid default null,
  p_markdown text default '',
  p_url text default null,
  p_name_enc bytea default null,
  p_url_enc bytea default null,
  p_ciphertext bytea default null,
  p_enc smallint default 0
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
  store_name text;
  store_url text;
  store_enc smallint := coalesce(p_enc, 0);
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
    if store_enc = 1 then
      if p_ciphertext is null then
        raise exception 'Ciphertext required';
      end if;
      bytes := pg_catalog.octet_length(p_ciphertext)::bigint;
      md := '';
    else
      bytes := public.utf8_bytes(md);
    end if;
    if settings.used_bytes + bytes > settings.quota_bytes then
      raise exception 'Quota exceeded';
    end if;
  end if;

  store_name := case when p_name_enc is not null then 'encrypted' else p_name end;
  store_url := case when p_url_enc is not null then null else p_url end;

  select coalesce(max(position), -1) + 1 into next_pos
  from workspace_nodes
  where user_id = uid and parent_id is not distinct from p_parent_id;

  insert into workspace_nodes (
    user_id, parent_id, kind, name, position, url, name_enc, url_enc
  )
  values (
    uid, p_parent_id, p_kind, store_name, next_pos, store_url, p_name_enc, p_url_enc
  )
  returning id into new_id;

  if p_kind = 'document' then
    insert into documents (
      node_id, user_id, markdown, version, size_bytes, ciphertext, enc
    )
    values (
      new_id, uid, md, 1, bytes,
      case when store_enc = 1 then p_ciphertext else null end,
      store_enc
    );
    perform public.recompute_used_bytes(uid);
  end if;

  return new_id;
end;
$$;

revoke all on function public.create_workspace_node(text, text, uuid, text, text, bytea, bytea, bytea, smallint) from public;
grant execute on function public.create_workspace_node(text, text, uuid, text, text, bytea, bytea, bytea, smallint) to authenticated;

drop function if exists public.create_document_conflict_copy(uuid, bigint, text);

create function public.create_document_conflict_copy(
  p_origin_id uuid,
  p_base_version bigint,
  p_markdown text,
  p_conflict_key text default null,
  p_ciphertext bytea default null,
  p_enc smallint default 0,
  p_name_enc bytea default null
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
  store_enc smallint := coalesce(p_enc, 0);
  store_markdown text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_origin_id is null or p_base_version is null or p_base_version < 1 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  if store_enc = 1 then
    if p_ciphertext is null or p_conflict_key is null then
      return jsonb_build_object('ok', false, 'reason', 'invalid_input');
    end if;
    store_markdown := '';
    copy_bytes := pg_catalog.octet_length(p_ciphertext)::bigint;
    copy_key := p_conflict_key;
  else
    if p_markdown is null then
      return jsonb_build_object('ok', false, 'reason', 'invalid_input');
    end if;
    store_markdown := p_markdown;
    copy_bytes := public.utf8_bytes(p_markdown);
    copy_key := coalesce(
      nullif(p_conflict_key, ''),
      pg_catalog.md5(
        p_origin_id::text || chr(31) || p_base_version::text || chr(31) || p_markdown
      )
    );
  end if;

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

  if settings.used_bytes + copy_bytes > settings.quota_bytes then
    return jsonb_build_object('ok', false, 'reason', 'quota');
  end if;

  select coalesce(max(position), -1) + 1 into next_pos
  from public.workspace_nodes
  where user_id = uid
    and parent_id is not distinct from origin_node.parent_id;

  copy_name :=
    case when p_name_enc is not null then 'encrypted'
    else
      regexp_replace(origin_node.name, '\.md$', '', 'i')
      || ' (conflict '
      || to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD-HH24-MI-SS')
      || ').md'
    end;

  begin
    insert into public.workspace_nodes (
      user_id,
      parent_id,
      kind,
      name,
      position,
      name_enc,
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
      p_name_enc,
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
    size_bytes,
    ciphertext,
    enc
  )
  values (
    copy_id, uid, store_markdown, 1, copy_bytes,
    case when store_enc = 1 then p_ciphertext else null end,
    store_enc
  );

  update public.user_settings
  set
    used_bytes = used_bytes + copy_bytes,
    updated_at = statement_timestamp()
  where user_id = uid;

  return jsonb_build_object('ok', true, 'copyId', copy_id, 'created', true);
end;
$$;

revoke all on function public.create_document_conflict_copy(uuid, bigint, text, text, bytea, smallint, bytea) from public;
revoke all on function public.create_document_conflict_copy(uuid, bigint, text, text, bytea, smallint, bytea) from anon;
grant execute on function public.create_document_conflict_copy(uuid, bigint, text, text, bytea, smallint, bytea) to authenticated;

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

  if node.system_key in ('trash', 'inbox', 'vault') then
    raise exception 'Cannot move a system item';
  end if;

  if p_parent_id is not null then
    if not exists (
      select 1 from workspace_nodes
      where id = p_parent_id and user_id = uid and kind = 'folder'
    ) then
      raise exception 'Invalid parent';
    end if;

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

  if node.system_key in ('trash', 'inbox', 'vault') then
    raise exception 'Cannot delete a system item';
  end if;

  delete from workspace_nodes
  where id = p_node_id and user_id = uid;

  perform public.recompute_used_bytes(uid);
end;
$$;

create or replace function public.create_vault(
  p_dek_wrapped_pass bytea,
  p_salt_pass bytea,
  p_dek_wrapped_recovery bytea,
  p_salt_recovery bytea,
  p_verifier bytea,
  p_kdf text default 'pbkdf2-sha256',
  p_kdf_params jsonb default '{"iterations":600000}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  vault_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from user_vault where user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'exists');
  end if;

  select id into vault_id
  from workspace_nodes
  where user_id = uid and system_key = 'vault'
  limit 1;

  if vault_id is null then
    insert into workspace_nodes (
      user_id, parent_id, kind, name, position, system_key
    )
    values (uid, null, 'folder', 'Vault', 80, 'vault')
    returning id into vault_id;
  end if;

  insert into user_vault (
    user_id,
    node_id,
    dek_wrapped_pass,
    kdf,
    kdf_params,
    salt_pass,
    dek_wrapped_recovery,
    salt_recovery,
    verifier
  )
  values (
    uid,
    vault_id,
    p_dek_wrapped_pass,
    coalesce(nullif(p_kdf, ''), 'pbkdf2-sha256'),
    coalesce(p_kdf_params, '{"iterations":600000}'::jsonb),
    p_salt_pass,
    p_dek_wrapped_recovery,
    p_salt_recovery,
    p_verifier
  );

  return jsonb_build_object('ok', true, 'nodeId', vault_id);
end;
$$;

revoke all on function public.create_vault(bytea, bytea, bytea, bytea, bytea, text, jsonb) from public;
grant execute on function public.create_vault(bytea, bytea, bytea, bytea, bytea, text, jsonb) to authenticated;

create or replace function public.update_vault_wraps(
  p_dek_wrapped_pass bytea,
  p_salt_pass bytea,
  p_dek_wrapped_recovery bytea default null,
  p_salt_recovery bytea default null,
  p_kdf text default null,
  p_kdf_params jsonb default null,
  p_verifier bytea default null
)
returns void
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
  if p_dek_wrapped_pass is null or p_salt_pass is null then
    raise exception 'Passphrase wrap is required';
  end if;

  update user_vault
  set
    dek_wrapped_pass = p_dek_wrapped_pass,
    salt_pass = p_salt_pass,
    dek_wrapped_recovery = coalesce(p_dek_wrapped_recovery, dek_wrapped_recovery),
    salt_recovery = coalesce(p_salt_recovery, salt_recovery),
    kdf = coalesce(nullif(p_kdf, ''), kdf),
    kdf_params = coalesce(p_kdf_params, kdf_params),
    verifier = coalesce(p_verifier, verifier),
    updated_at = now()
  where user_id = uid;

  if not found then
    raise exception 'Vault not found';
  end if;
end;
$$;

revoke all on function public.update_vault_wraps(bytea, bytea, bytea, bytea, text, jsonb, bytea) from public;
grant execute on function public.update_vault_wraps(bytea, bytea, bytea, bytea, text, jsonb, bytea) to authenticated;

create or replace function public.purge_document_revisions(p_node_id uuid)
returns void
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
  if not exists (
    select 1 from workspace_nodes
    where id = p_node_id and user_id = uid
  ) then
    raise exception 'Node not found';
  end if;
  delete from document_revisions
  where node_id = p_node_id and user_id = uid;
end;
$$;

revoke all on function public.purge_document_revisions(uuid) from public;
grant execute on function public.purge_document_revisions(uuid) to authenticated;

create or replace function public.set_workspace_node_enc(
  p_node_id uuid,
  p_name text,
  p_name_enc bytea default null,
  p_url text default null,
  p_url_enc bytea default null
)
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
  if node.system_key in ('trash', 'inbox', 'vault') then
    raise exception 'Cannot rename a system item';
  end if;

  update workspace_nodes
  set
    name = coalesce(nullif(p_name, ''), name),
    name_enc = p_name_enc,
    url = p_url,
    url_enc = p_url_enc,
    updated_at = now()
  where id = p_node_id and user_id = uid;
end;
$$;

revoke all on function public.set_workspace_node_enc(uuid, text, bytea, text, bytea) from public;
grant execute on function public.set_workspace_node_enc(uuid, text, bytea, text, bytea) to authenticated;

create or replace function public.delete_vault()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  vault_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select node_id into vault_id from user_vault where user_id = uid;
  if vault_id is null then
    select id into vault_id
    from workspace_nodes
    where user_id = uid and system_key = 'vault'
    limit 1;
  end if;
  if vault_id is null then
    return;
  end if;

  if exists (
    select 1 from workspace_nodes
    where parent_id = vault_id and user_id = uid
  ) then
    raise exception 'Vault is not empty';
  end if;

  delete from user_vault where user_id = uid;
  delete from workspace_nodes where id = vault_id and user_id = uid;
end;
$$;

revoke all on function public.delete_vault() from public;
grant execute on function public.delete_vault() to authenticated;
