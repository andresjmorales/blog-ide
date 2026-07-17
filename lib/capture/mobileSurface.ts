export type MobileSurface = "capture" | "app";

const SURFACE_KEY = "blogide.mobileSurface";
const CHANNEL_KEY = "blogide.captureChannelId";
const SURFACE_EVENT = "blogide-mobile-surface";
const CHANNEL_EVENT = "blogide-capture-channel";

/** Explicit preference, or null if the user hasn't chosen yet. */
export function loadMobileSurface(): MobileSurface | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(SURFACE_KEY);
  if (value === "app" || value === "capture") return value;
  return null;
}

export function saveMobileSurface(surface: MobileSurface): void {
  localStorage.setItem(SURFACE_KEY, surface);
  window.dispatchEvent(new Event(SURFACE_EVENT));
}

export function subscribeMobileSurface(listener: () => void): () => void {
  window.addEventListener(SURFACE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(SURFACE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function loadLastCaptureChannelId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CHANNEL_KEY);
}

export function saveLastCaptureChannelId(channelId: string): void {
  localStorage.setItem(CHANNEL_KEY, channelId);
  window.dispatchEvent(new Event(CHANNEL_EVENT));
}

export function subscribeCaptureChannel(listener: () => void): () => void {
  window.addEventListener(CHANNEL_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANNEL_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
