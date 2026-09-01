const BLOCKED_FETCH =
  /networkerror|failed to fetch|load failed|network request failed/i;

export function isPushbulletBlockedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return BLOCKED_FETCH.test(message);
}

export function formatPushbulletUserError(err: unknown): string {
  if (isPushbulletBlockedError(err)) {
    return "Could not reach Pushbullet. Ad blockers (uBlock Origin) often block it. Open the ? next to Pushbullet for how to allow this page.";
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return "Pushbullet request failed.";
}

export const PUSHBULLET_TROUBLESHOOTING =
  "Ad blockers such as uBlock Origin treat Pushbullet as a tracker and block api.pushbullet.com and stream.pushbullet.com. BlogIDE sends API calls through this site so capture still works with the blocker on. The live stream is optional; catch-up polling is enough. If Test token still fails, allow those two hosts for this page, or disable the blocker on BlogIDE.";

