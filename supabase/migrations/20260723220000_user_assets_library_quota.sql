-- Track 2 + 5: combined quota (markdown + Storage), user_assets inventory,
-- library_items for durable PDF/link Library. Assets bucket stays public-by-URL;
-- allow application/pdf for Library uploads.

-- 1) Tables ------------------------------------------------------------------

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
create index if not exists user_assets_kind_idx on user_assets (user_id, kind);

alter table user_assets enable row level security;

drop policy if exists "user_assets owner select" on user_assets;
drop policy if exists "user_assets owner all" on user_assets;
create policy "user_assets owner select" on user_assets
  for select using (auth.uid() = user_id);

-- Writes go through definer RPCs only.
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

-- 2) Quota recompute includes Storage inventory ------------------------------

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

-- 3) Register / release asset bytes ------------------------------------------

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

  select * into settings
  from user_settings
  where user_id = uid
  for update;

  select byte_size into old_bytes
  from user_assets
  where user_id = uid and path = p_path;
  old_bytes := coalesce(old_bytes, 0);

  if settings.used_bytes - old_bytes + p_byte_size > settings.quota_bytes then
    return jsonb_build_object('ok', false, 'reason', 'quota');
  end if;

  insert into user_assets (user_id, path, byte_size, content_type, kind, node_id)
  values (
    uid,
    p_path,
    p_byte_size,
    coalesce(nullif(trim(p_content_type), ''), 'application/octet-stream'),
    p_kind,
    p_node_id
  )
  on conflict (user_id, path) do update
  set
    byte_size = excluded.byte_size,
    content_type = excluded.content_type,
    kind = excluded.kind,
    node_id = coalesce(excluded.node_id, user_assets.node_id);

  -- Always recompute so upserts (re-register) never double-count.
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

-- 4) Storage: allow Library PDFs (bucket remains public) ---------------------

update storage.buckets
set
  file_size_limit = 5242880, -- 5 MiB
  allowed_mime_types = array[
    'image/webp',
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf'
  ]
where id = 'assets';
