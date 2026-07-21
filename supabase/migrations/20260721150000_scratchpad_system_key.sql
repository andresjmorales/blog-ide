-- Give the system scratchpad a real identity (system_key = 'scratchpad').
-- Previously ensure_default_workspace adopted ANY root document named
-- scratchpad.md as the system scratchpad, silently hijacking user-created
-- files of that name (fixed file name, undeletable). Safe to re-run.

-- One-time claim: mark each user's genuine scratchpad (pinned, root-level,
-- bootstrap name). Oldest wins if there are somehow several.
with candidates as (
  select distinct on (user_id) id
  from workspace_nodes
  where system_key is null
    and parent_id is null
    and kind = 'document'
    and pinned
    and lower(name) = 'scratchpad.md'
  order by user_id, created_at asc
)
update workspace_nodes
set system_key = 'scratchpad'
where id in (select id from candidates);

-- Bootstrap: look up by system_key; claim a legacy row once; else create.
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
title: Notes
status: draft
---

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

  select id into inbox_id
  from workspace_nodes
  where user_id = uid and system_key = 'inbox'
  limit 1;

  if inbox_id is null then
    insert into workspace_nodes (user_id, parent_id, kind, name, position, system_key)
    values (uid, null, 'folder', 'Inbox', 90, 'inbox')
    returning id into inbox_id;
  end if;

  select id into notes_id
  from workspace_nodes
  where user_id = uid and parent_id = inbox_id and kind = 'document' and name = 'notes.md'
  limit 1;

  if notes_id is null then
    insert into workspace_nodes (user_id, parent_id, kind, name, position)
    values (uid, inbox_id, 'document', 'notes.md', 0)
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

-- The scratchpad joins Trash/Inbox as a protected system node.
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

  if node.system_key in ('trash', 'inbox', 'scratchpad') then
    raise exception 'Cannot delete a system item';
  end if;

  delete from workspace_nodes
  where id = p_node_id and user_id = uid;

  perform public.recompute_used_bytes(uid);
end;
$$;
