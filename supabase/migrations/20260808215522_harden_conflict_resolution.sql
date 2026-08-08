-- Durable, idempotent conflict copies and explicit conflict resolution.

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
