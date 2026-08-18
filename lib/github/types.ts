/**
 * GitHub backup maps. Supabase stays source of truth. A push overwrites
 * matching files and never deletes extras. Pull is explicit and confirmed.
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

export type GithubMapHealth = "ok" | "missing" | "unchecked" | "error";

export type GithubResolvedBinding = {
  nodeId: string;
  kind: "folder" | "document";
  repo: string;
  branch: string;
  path: string;
  source: "direct" | "inherited";
  mapNodeId: string;
};

export type GithubMapStatus = GithubResolvedBinding & {
  health: GithubMapHealth;
  /** Same filename at another repo path (likely `git mv`). */
  candidates: string[];
  /** Mapped node is missing from the workspace or in Trash. */
  stale: boolean;
  /** Other BlogIDE documents with the same filename (not created from GitHub). */
  workspaceTwins: Array<{ nodeId: string; label: string }>;
  /**
   * GitHub markdown under a mapped folder that looks like this file moved
   * (`git mv`). Listed so the UI can say BlogIDE did not import a second essay.
   */
  unimportedGithubPaths: string[];
  /** Other BlogIDE documents mapped to this same GitHub path. */
  pathCollisions: Array<{ nodeId: string; label: string }>;
  detail?: string;
};

export type GithubTreeIndex = {
  blobs: string[];
  trees: string[];
  truncated: boolean;
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
  nodeId?: string;
};

export type GithubPushResult = {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  fileCount: number;
  htmlUrl: string;
};
