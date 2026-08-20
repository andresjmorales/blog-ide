type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
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
  const el = doc.documentElement as FullscreenElement;
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
    doc.addEventListener(event, onChange);
  }
  return () => {
    for (const event of CHANGE_EVENTS) {
      doc.removeEventListener(event, onChange);
    }
  };
}
