-- Free hosted tier: 10 MiB default quota (was 20 MiB).

alter table user_settings alter column quota_bytes set default 10485760;

-- Only clamp the previous free default. Leave Pro (100 MiB) and self-host alone.
update user_settings
set quota_bytes = 10485760
where quota_bytes = 20971520
  and coalesce(plan, 'free') = 'free';
