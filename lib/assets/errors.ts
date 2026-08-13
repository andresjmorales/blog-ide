/** Map Storage / network failures to copy a writer can act on. */

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function classifyStorageError(error: unknown): string {
  if (isBrowserOffline()) {
    return "You appear to be offline. The image was kept locally; it will not be in cloud Storage until you reconnect and upload again.";
  }

  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const lower = raw.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    error instanceof TypeError
  ) {
    return "Could not reach Storage. Check your connection, then try again. A local copy was kept in the essay if the insert continued.";
  }

  if (
    lower.includes("payload too large") ||
    lower.includes("entity too large") ||
    lower.includes("maximum allowed size")
  ) {
    return "That file is larger than Storage allows. Try a smaller image, or let BlogIDE compress it first.";
  }

  if (
    lower.includes("invalid jwt") ||
    lower.includes("jwt expired") ||
    lower.includes("not authenticated") ||
    lower.includes("unauthorized")
  ) {
    return "Sign in again to upload to Storage.";
  }

  if (
    lower.includes("duplicate") ||
    lower.includes("already exists") ||
    lower.includes("resource already exists")
  ) {
    return "An object with that name already exists. Try the upload again.";
  }

  if (lower.includes("mime") || lower.includes("not allowed") || lower.includes("invalid type")) {
    return "That file type is not allowed. Use a common image format (JPEG, PNG, WebP, GIF).";
  }

  if (lower.includes("quota")) {
    return "This would exceed your combined markdown + Storage quota. Free space in Settings (Clean unused images) or remove Library files.";
  }

  return raw.trim() || "Could not upload to Storage.";
}
