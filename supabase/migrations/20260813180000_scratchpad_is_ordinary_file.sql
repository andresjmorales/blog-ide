-- Treat the seeded scratchpad as a regular essay: users can rename, move,
-- unpin, or trash it. Move/delete RPCs only protect Notes and Trash.
-- Scratchpad is seeded for fresh workspaces only (like Welcome) so deleting
-- it is permanent. Existing scratchpads keep their system_key identity.

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

BlogIDE is a local-first writing IDE for essays that publish as clean markdown. Everything you type autosaves to this browser instantly and syncs to the cloud a moment later — watch the check mark next to your avatar.

This page is a regular essay. So is the pinned scratchpad.md next to it. Rename, move, unpin, or trash either of them whenever you want; the Files panel still has essays/, drafts/, Notes, and Trash.

## The panels

The **Files** panel (left) is your workspace tree. Hover a folder for quick-create buttons, right-click (or use the ⋯ kebab) for rename, move, pin, color, and Trash. Pinned items stay at the top. Changing an essay title also renames its file. Every panel tab can be dragged between the left and right docks, popped out into a floating window, or closed — reopen them from the panels menu in the header.

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

The **Notes** panel is a capture stream for notes-to-self: type a thought and it lands timestamped in a channel (default `general`). Manage channels from the Notes panel toolbar — Open channel doc only when you need the raw markdown. On your phone, BlogIDE opens straight into capture mode so you can push notes from anywhere.

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
