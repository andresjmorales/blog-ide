-- GitHub one-way backup: default path prefix + per-folder/document maps.
-- PAT stays client-side (never stored here).

alter table user_settings add column if not exists github_path text;
alter table user_settings add column if not exists github_maps jsonb not null default '[]'::jsonb;

revoke insert, update on user_settings from anon, authenticated;
grant insert (
  user_id,
  github_repo,
  github_branch,
  github_path,
  github_maps,
  editor_prefs,
  updated_at
) on user_settings to authenticated;
grant update (
  user_id,
  github_repo,
  github_branch,
  github_path,
  github_maps,
  editor_prefs,
  updated_at
) on user_settings to authenticated;
