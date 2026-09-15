-- Starter essays/ and drafts/ are first-run only. Later boots used to
-- recreate those names whenever they were missing from the tree (or, after
-- #106, missing from the whole tree including Trash). Never insert them
-- again after the first sign-in. Notes and Trash remain system sections.

-- Bootstrap default IDE tree for the current user.
-- First sign-in: seed a starter Files tree (essays/, drafts/, welcome.md,
-- scratchpad.md) plus Notes and Trash.
-- Later boots: keep system sections (Notes, Trash) and a Notes channel if
-- the inbox has none. Never recreate starter folders or essays by name.
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

This page is a regular essay. So is the pinned scratchpad.md next to it. Rename, move, unpin, or trash any starter file or folder whenever you want. Notes and Trash stay as system sections.

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

  -- Starter folders exist only for a brand-new account. After that they
  -- are ordinary folders: trashing or renaming them must not mint twins.
  if is_fresh then
    insert into workspace_nodes (user_id, parent_id, kind, name, position)
    values (uid, null, 'folder', 'essays', 0)
    returning id into essays_id;

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

  -- Seed once for brand-new workspaces. Deleting it is permanent.
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
  order by position asc, created_at asc
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

