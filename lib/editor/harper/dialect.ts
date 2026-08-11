import { Dialect } from "harper.js";

/** English tags Harper can actually lint. */
export const HARPER_LANGUAGE_OPTIONS: Array<{
  code: string;
  label: string;
  dialect: Dialect;
}> = [
  { code: "en-US", label: "English (US)", dialect: Dialect.American },
  { code: "en-GB", label: "English (UK)", dialect: Dialect.British },
  { code: "en-AU", label: "English (AU)", dialect: Dialect.Australian },
  { code: "en-CA", label: "English (CA)", dialect: Dialect.Canadian },
];

export function dialectFromLang(lang: string): Dialect | null {
  const normalized = lang.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "en" || normalized.startsWith("en-us")) {
    return Dialect.American;
  }
  if (normalized.startsWith("en-gb")) return Dialect.British;
  if (normalized.startsWith("en-au")) return Dialect.Australian;
  if (normalized.startsWith("en-ca")) return Dialect.Canadian;
  if (normalized.startsWith("en-in")) return Dialect.Indian;
  if (normalized.startsWith("en-")) return Dialect.American;
  return null;
}

export function isHarperSupportedLang(lang: string): boolean {
  return dialectFromLang(lang) != null;
}
