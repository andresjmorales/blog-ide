/**
 * Zotero Web API credentials. Device-local only — never written to
 * Supabase or sent to BlogIDE's server. Same pattern as GitHub PAT and AI keys.
 */

import {
  DEFAULT_CITE_STYLE,
  isCiteStyleId,
  type CiteStyleId,
} from "@/lib/citations/citeStyle";

const KEY_API = "blogide.zotero.apiKey";
const KEY_USER = "blogide.zotero.userId";
const KEY_TYPE = "blogide.zotero.libraryType";
const KEY_GROUP = "blogide.zotero.groupId";
const KEY_STYLE = "blogide.zotero.style";

export const ZOTERO_CONFIG_EVENT = "blogide-zotero-config";

export type ZoteroLibraryType = "user" | "group";

export type ZoteroConfig = {
  apiKey: string;
  userId: string;
  libraryType: ZoteroLibraryType;
  groupId: string;
  style: CiteStyleId;
};

const EMPTY: ZoteroConfig = {
  apiKey: "",
  userId: "",
  libraryType: "user",
  groupId: "",
  style: DEFAULT_CITE_STYLE,
};

function readItem(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  if (!value) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

function notify(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ZOTERO_CONFIG_EVENT));
}

export function loadZoteroConfig(): ZoteroConfig {
  const libraryType = readItem(KEY_TYPE) === "group" ? "group" : "user";
  const styleRaw = readItem(KEY_STYLE);
  return {
    apiKey: readItem(KEY_API),
    userId: readItem(KEY_USER),
    libraryType,
    groupId: readItem(KEY_GROUP),
    style: isCiteStyleId(styleRaw) ? styleRaw : DEFAULT_CITE_STYLE,
  };
}

export function saveZoteroConfig(next: Partial<ZoteroConfig>): ZoteroConfig {
  const current = loadZoteroConfig();
  const merged: ZoteroConfig = { ...current, ...next };
  writeItem(KEY_API, merged.apiKey.trim());
  writeItem(KEY_USER, merged.userId.trim());
  writeItem(KEY_TYPE, merged.libraryType === "group" ? "group" : "user");
  writeItem(KEY_GROUP, merged.groupId.trim());
  writeItem(
    KEY_STYLE,
    isCiteStyleId(merged.style) ? merged.style : DEFAULT_CITE_STYLE
  );
  notify();
  return loadZoteroConfig();
}

export function clearZoteroConfig(): void {
  writeItem(KEY_API, "");
  writeItem(KEY_USER, "");
  writeItem(KEY_TYPE, "");
  writeItem(KEY_GROUP, "");
  writeItem(KEY_STYLE, "");
  notify();
}

export function isZoteroConnected(config: ZoteroConfig = loadZoteroConfig()): boolean {
  if (!config.apiKey) return false;
  if (config.libraryType === "group") return Boolean(config.groupId.trim());
  return Boolean(config.userId.trim());
}

export function maskZoteroKey(key: string | undefined): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function emptyZoteroConfig(): ZoteroConfig {
  return { ...EMPTY };
}
