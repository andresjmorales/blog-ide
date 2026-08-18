/**
 * Shared GitHub backup actions for Files context menus and the essay ⋯ menu.
 */

export type GithubMenuActionId = "map-github" | "pull-github" | "push-github";

export type GithubMenuAction = {
  id: GithubMenuActionId;
  label: string;
  disabled?: boolean;
};

export function githubActionMenuItems(input: {
  mapped: boolean;
  includeMap?: boolean;
  includePull?: boolean;
  includePush?: boolean;
}): GithubMenuAction[] {
  const includeMap = input.includeMap !== false;
  const includePull = input.includePull !== false;
  const includePush = input.includePush !== false;
  const items: GithubMenuAction[] = [];
  if (includeMap) {
    items.push({ id: "map-github", label: "Map to GitHub…" });
  }
  if (includePull) {
    items.push({
      id: "pull-github",
      label: "Pull from GitHub…",
      disabled: !input.mapped,
    });
  }
  if (includePush) {
    items.push({ id: "push-github", label: "Push to GitHub" });
  }
  return items;
}
