-- Optional accent color for workspace tree nodes (Files explorer dots).
alter table workspace_nodes add column if not exists color text;
