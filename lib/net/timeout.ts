/** Timeouts for hung TCP / content-filter blackholes (fetch never rejects). */

export const WORKSPACE_READ_TIMEOUT_MS = 8_000;
export const SYNC_WRITE_TIMEOUT_MS = 15_000;
export const NAVIGATION_FETCH_TIMEOUT_MS = 4_000;
export const BOOT_SLOW_HINT_MS = 2_500;
export const OPEN_DOC_FLUSH_TIMEOUT_MS = 2_000;

export class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

export function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: unknown; message?: unknown };
  if (err.name === "TimeoutError" || err.name === "AbortError") return true;
  const message = typeof err.message === "string" ? err.message.toLowerCase() : "";
  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("abort")
  );
}

/** AbortSignal that fires after `ms`. Falls back when AbortSignal.timeout is missing. */
export function requestTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * Reject if `promise` has not settled within `ms`.
 * Does not cancel the underlying work unless that work honors a signal.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = `Timed out after ${ms}ms`
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(message));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
