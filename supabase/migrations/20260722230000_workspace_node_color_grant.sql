-- Allow authenticated clients to set explorer accent colors.
-- The color column was added earlier; column-level UPDATE grants still
-- omitted it, so setWorkspaceNodeColor failed with a privilege error.

alter table workspace_nodes add column if not exists color text;

grant update (name, url, pinned, color, updated_at)
  on workspace_nodes to authenticated;
