-- Optional accent color for workspace tree nodes (Files explorer dots).
alter table workspace_nodes add column if not exists color text;

-- Column-level UPDATE grant (must include color or client updates fail).
grant update (name, url, pinned, color, updated_at)
  on workspace_nodes to authenticated;
