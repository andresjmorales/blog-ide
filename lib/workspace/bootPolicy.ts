function browserLooksOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Seconds to wait between boot attempts (then stay on the last value). */
export const BOOT_RETRY_DELAYS_SEC = [4, 8, 12, 20] as const;

/** Show the blocking dialog after this many failed attempts (offline: sooner). */
export const BOOT_DIALOG_AFTER_ONLINE = 2;
export const BOOT_DIALOG_AFTER_OFFLINE = 1;

export function nextRetryDelaySec(failedAttempts: number): number {
  const index = Math.max(0, failedAttempts - 1);
  const last = BOOT_RETRY_DELAYS_SEC.length - 1;
  return BOOT_RETRY_DELAYS_SEC[Math.min(index, last)] ?? 20;
}

export function attemptsBeforeDialog(offline = browserLooksOffline()): number {
  return offline ? BOOT_DIALOG_AFTER_OFFLINE : BOOT_DIALOG_AFTER_ONLINE;
}

export function shouldShowConnectionDialog(
  failedAttempts: number,
  hasLocalTree: boolean,
  offline = browserLooksOffline()
): boolean {
  if (hasLocalTree) return false;
  return failedAttempts >= attemptsBeforeDialog(offline);
}

export type BootLabelInput = {
  inFlight: boolean;
  failedAttempts: number;
  retryInSec: number | null;
  slow: boolean;
  offline?: boolean;
};

/**
 * Status copy for the Files panel / boot splash while the cloud is unreachable.
 * Numbers are live; the parent ticks `retryInSec`.
 */
export function formatWorkspaceBootLabel(input: BootLabelInput): string {
  const offline = input.offline ?? browserLooksOffline();

  if (input.inFlight && input.failedAttempts === 0) {
    if (offline) return "You appear to be offline. Trying the cloud…";
    if (input.slow) return "Still connecting to the cloud…";
    return "Loading workspace…";
  }

  if (input.inFlight) {
    return offline ? "You appear to be offline. Trying again…" : "Trying again…";
  }

  if (input.retryInSec != null && input.retryInSec > 0) {
    const seconds = `${input.retryInSec}…`;
    if (offline) return `You appear to be offline. Retrying in ${seconds}`;
    return `Retrying in ${seconds}`;
  }

  if (input.failedAttempts > 0) {
    return "Could not reach the cloud.";
  }

  return "Loading workspace…";
}
