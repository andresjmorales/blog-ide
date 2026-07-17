export type MobileSurface = "capture" | "app";

const SURFACE_KEY = "blogide.mobileSurface";
const CHANNEL_KEY = "blogide.captureChannelId";

/** Explicit preference, or null if the user hasn't chosen yet. */
export function loadMobileSurface(): MobileSurface | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(SURFACE_KEY);
  if (value === "app" || value === "capture") return value;
  return null;
}

export function saveMobileSurface(surface: MobileSurface): void {
  localStorage.setItem(SURFACE_KEY, surface);
}

export function loadLastCaptureChannelId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CHANNEL_KEY);
}

export function saveLastCaptureChannelId(channelId: string): void {
  localStorage.setItem(CHANNEL_KEY, channelId);
}
