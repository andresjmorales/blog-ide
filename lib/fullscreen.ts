export type FullscreenElement = {
  requestFullscreen?: () => Promise<void> | void;
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export type FullscreenDocument = {
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void> | void;
  webkitExitFullscreen?: () => Promise<void> | void;
  documentElement: FullscreenElement;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

export function isFullscreen(
  doc: FullscreenDocument = document
): boolean {
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export async function toggleFullscreen(
  doc: FullscreenDocument = document
): Promise<void> {
  if (isFullscreen(doc)) {
    if (doc.exitFullscreen) {
      await doc.exitFullscreen();
      return;
    }
    await doc.webkitExitFullscreen?.();
    return;
  }
  const el = doc.documentElement;
  if (el.requestFullscreen) {
    await el.requestFullscreen();
    return;
  }
  await el.webkitRequestFullscreen?.();
}

const CHANGE_EVENTS = ["fullscreenchange", "webkitfullscreenchange"] as const;

export function subscribeFullscreen(
  onChange: () => void,
  doc: FullscreenDocument = document
): () => void {
  for (const event of CHANGE_EVENTS) {
    doc.addEventListener?.(event, onChange);
  }
  return () => {
    for (const event of CHANGE_EVENTS) {
      doc.removeEventListener?.(event, onChange);
    }
  };
}
