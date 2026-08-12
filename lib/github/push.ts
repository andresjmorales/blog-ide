import {
  beginUploadStatus,
  updateUploadStatus,
} from "@/lib/assets/uploadStatus";
import { getLocalDoc } from "@/lib/db/indexed";
import { githubErrorCopy, pushFilesToGithub } from "@/lib/github/client";
import { buildGithubPushPlans } from "@/lib/github/files";
import { loadGithubSettings } from "@/lib/github/settings";
import { loadGithubToken } from "@/lib/github/token";
import type { GithubPushResult } from "@/lib/github/types";
import { listAllDocumentBodies, listWorkspaceNodes } from "@/lib/workspace/api";
import type { WorkspaceNode } from "@/lib/workspace/types";

export type GithubPushProgress = {
  phase: "collect" | "upload" | "done";
  message: string;
  repo?: string;
  fileCount?: number;
};

async function collectBodies(
  nodes: WorkspaceNode[]
): Promise<Map<string, string>> {
  const remote = await listAllDocumentBodies();
  const bodies = new Map<string, string>();
  for (const node of nodes) {
    if (node.kind !== "document") continue;
    const local = await getLocalDoc(node.id);
    const markdown = local?.dirty
      ? local.markdown
      : (remote.get(node.id) ?? local?.markdown ?? "");
    bodies.set(node.id, markdown);
  }
  return bodies;
}

export async function pushWorkspaceToGithub(input: {
  scope: "workspace" | { nodeId: string };
  onProgress?: (progress: GithubPushProgress) => void;
}): Promise<GithubPushResult[]> {
  const token = loadGithubToken();
  if (!token) {
    throw new Error(
      "Add a GitHub personal access token in Account settings. It stays on this device."
    );
  }

  input.onProgress?.({
    phase: "collect",
    message: "Collecting essays…",
  });

  const [settings, nodes] = await Promise.all([
    loadGithubSettings(),
    listWorkspaceNodes(),
  ]);
  const bodies = await collectBodies(nodes);
  const plans = buildGithubPushPlans({
    nodes,
    bodies,
    defaultRepo: settings.repo,
    defaultBranch: settings.branch,
    defaultPath: settings.path,
    maps: settings.maps,
    scope: input.scope,
  });

  const results: GithubPushResult[] = [];
  for (const plan of plans) {
    input.onProgress?.({
      phase: "upload",
      message: `Pushing ${plan.files.length} file${
        plan.files.length === 1 ? "" : "s"
      } to ${plan.repo}…`,
      repo: plan.repo,
      fileCount: plan.files.length,
    });
    try {
      const result = await pushFilesToGithub({
        token,
        repo: plan.repo,
        branch: plan.branch,
        files: plan.files,
        message: `blogide: sync ${plan.files.length} file${
          plan.files.length === 1 ? "" : "s"
        }`,
      });
      results.push(result);
    } catch (error) {
      throw new Error(githubErrorCopy(error));
    }
  }

  input.onProgress?.({
    phase: "done",
    message: `Pushed ${results.reduce((n, r) => n + r.fileCount, 0)} file${
      results.reduce((n, r) => n + r.fileCount, 0) === 1 ? "" : "s"
    }.`,
  });
  return results;
}

/** Push with the shared upload-status toast. */
export async function pushWorkspaceToGithubWithStatus(input: {
  scope: "workspace" | { nodeId: string };
}): Promise<GithubPushResult[]> {
  const statusId = beginUploadStatus("uploading", "Collecting essays…");
  try {
    const results = await pushWorkspaceToGithub({
      scope: input.scope,
      onProgress: (progress) => {
        updateUploadStatus(statusId, {
          phase: progress.phase === "done" ? "done" : "uploading",
          message: progress.message,
        });
      },
    });
    return results;
  } catch (error) {
    updateUploadStatus(statusId, {
      phase: "error",
      message:
        error instanceof Error ? error.message : "GitHub push failed.",
    });
    throw error;
  }
}
