/** Classify workspace bootstrap / tree load failures for friendlier UI. */

export type WorkspaceFailureKind = "network" | "auth" | "schema" | "unknown";

export function classifyWorkspaceFailure(error: unknown): WorkspaceFailureKind {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const lower = message.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network error") ||
    lower.includes("load failed") ||
    lower.includes("cors") ||
    lower.includes("mixed content") ||
    lower.includes("err_connection") ||
    lower.includes("err_tunnel") ||
    lower.includes("err_cert") ||
    lower.includes("ssl") ||
    lower.includes("certificate")
  ) {
    return "network";
  }

  if (
    lower.includes("jwt") ||
    lower.includes("not authenticated") ||
    lower.includes("invalid claim") ||
    lower.includes("session") ||
    /\b401\b/.test(lower) ||
    /\b403\b/.test(lower)
  ) {
    return "auth";
  }

  if (
    lower.includes("schema.sql") ||
    lower.includes("schema cache") ||
    (lower.includes("function") && lower.includes("not found")) ||
    lower.includes("pgrst") ||
    lower.includes("scratchpad")
  ) {
    return "schema";
  }

  // PostgrestError often has empty message but name/code; treat bare TypeErrors as network.
  if (error instanceof TypeError) return "network";

  return "unknown";
}

export function workspaceFailureUserCopy(kind: WorkspaceFailureKind): {
  title: string;
  summary: string;
} {
  switch (kind) {
    case "network":
      return {
        title: "BlogIDE can’t reach the cloud",
        summary:
          "Your browser couldn’t connect to BlogIDE’s sync service. This is often a work network, VPN, or security proxy blocking or rewriting the connection. Essays already on this device are usually fine.",
      };
    case "auth":
      return {
        title: "Sign-in needs a refresh",
        summary:
          "BlogIDE couldn’t verify your session with the cloud. Try signing out and back in, or reload after checking that cookies aren’t blocked for this site.",
      };
    case "schema":
      return {
        title: "Workspace setup isn’t ready",
        summary:
          "The cloud database is missing something BlogIDE expects. If you run your own instance, re-run supabase/schema.sql. On the hosted site, contact the operator.",
      };
    default:
      return {
        title: "BlogIDE is having trouble connecting",
        summary:
          "We couldn’t load your workspace from the cloud. Your browser may be offline, blocked by a network filter, or briefly unable to reach BlogIDE’s servers.",
      };
  }
}
