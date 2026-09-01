-- Shared capture cursors so a new phone/laptop catch-up ingest
-- does not treat the first visit as "skip all existing pushes".

alter table user_settings add column if not exists capture_state jsonb not null default '{}'::jsonb;

revoke insert, update on user_settings from anon, authenticated;
grant insert (
  user_id,
  github_repo,
  github_branch,
  github_path,
  github_maps,
  editor_prefs,
  capture_state,
  updated_at
) on user_settings to authenticated;
grant update (
  user_id,
  github_repo,
  github_branch,
  github_path,
  github_maps,
  editor_prefs,
  capture_state,
  updated_at
) on user_settings to authenticated;
