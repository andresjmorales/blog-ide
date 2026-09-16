/**
 * Settings action toasts.
 *
 * Toast the outcome of a discrete Settings action (save, test, sync,
 * upload, checkout) so it stays visible while the dialog body scrolls.
 * Keep muted inline copy for field validation, persistent connection
 * status, and values that must remain on the page (recovery codes).
 */

import { showErrorToast, showSuccessToast, showToast } from "@/lib/ui/toast";

export const SETTINGS_TOAST = {
  account: "settings-account",
  photo: "settings-account-photo",
  password: "settings-account-password",
  storage: "settings-storage",
  billing: "settings-billing",
  vault: "settings-vault",
  ai: "settings-ai",
  zotero: "settings-zotero",
  github: "settings-github",
  pushbullet: "settings-pushbullet",
  ntfy: "settings-ntfy",
  essayGithub: "settings-essay-github",
} as const;

export function showSettingsSuccess(message: string, replaceKey: string): number {
  return showSuccessToast(message, undefined, replaceKey);
}

export function showSettingsError(
  error: unknown,
  fallback: string,
  replaceKey: string
): number {
  return showErrorToast(error, fallback, replaceKey);
}

export function showSettingsInfo(message: string, replaceKey: string): number {
  return showToast({ tone: "info", message, replaceKey });
}
