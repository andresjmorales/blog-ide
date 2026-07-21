-- Seed a deletable Welcome essay for brand-new users only. Freshness is
-- "no workspace rows yet", so existing users never see it appear and
-- deleting it is permanent. Safe to re-run.

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
title: Notes
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

## Research while you write

Paste a link and hover it for a live page preview. Pin a PDF (toolbar → PDF) to float it over the workspace while you quote from it. Images paste straight in — they're compressed and uploaded automatically.

## Inbox

The **Inbox** panel is a capture stream for notes-to-self: type a thought, it lands timestamped in a channel document under the Inbox folder. On your phone, BlogIDE opens straight into capture mode so you can push notes from anywhere.

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
