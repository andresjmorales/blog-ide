/**
 * One-way GitHub backup maps. Supabase stays source of truth: a push
 * overwrites matching files in the repo and never deletes extras.
 */

export type GithubSyncMap = {
  /** Folder or document node id. */
  nodeId: string;
  /**
   * `owner/repo`. Empty / omitted uses the account default repo.
   */
  repo?: string;
  /** Empty / omitted uses the account default branch. */
  branch?: string;
  /**
   * Folder: directory prefix in the repo (e.g. `content/essays`).
   * Document: exact file path (e.g. `README.md`).
   */
  path: string;
};

export type GithubRemoteSettings = {
  repo: string;
  branch: string;
  /** Default prefix for a full-workspace backup. */
  path: string;
  maps: GithubSyncMap[];
};

export const DEFAULT_GITHUB_SETTINGS: GithubRemoteSettings = {
  repo: "",
  branch: "main",
  path: "",
  maps: [],
};

export type GithubFile = {
  /** Path inside the repo, posix, no leading slash. */
  path: string;
  content: string;
};

export type GithubPushResult = {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  fileCount: number;
  htmlUrl: string;
};
