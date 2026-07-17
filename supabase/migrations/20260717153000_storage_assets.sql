-- Private-ish asset bucket for compressed images / future binaries.
-- Run in Supabase SQL editor if `supabase db push` is not used.
-- Policies: authenticated users may read/write only under their user id prefix.

insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

drop policy if exists "assets_select_own" on storage.objects;
drop policy if exists "assets_insert_own" on storage.objects;
drop policy if exists "assets_update_own" on storage.objects;
drop policy if exists "assets_delete_own" on storage.objects;

create policy "assets_select_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "assets_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "assets_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "assets_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'assets' and (storage.foldername(name))[1] = auth.uid()::text);
