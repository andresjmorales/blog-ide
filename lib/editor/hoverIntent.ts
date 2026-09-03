/**
 * Hover cards should wait for a brief pause so fast pointer motion and
 * scrolling do not flash them open.
 */

export const HOVER_OPEN_DELAY_MS = 180;
export const HOVER_CLOSE_DELAY_MS = 280;

export type HoverIntent = {
  enter: (id: string) => void;
  leave: () => void;
  hold: () => void;
  cancelOpen: () => void;
  dispose: () => void;
};

export function createHoverIntent(options: {
  onOpen: (id: string) => void;
  onClose: () => void;
  openDelayMs?: number;
  closeDelayMs?: number;
}): HoverIntent {
  const openDelay = options.openDelayMs ?? HOVER_OPEN_DELAY_MS;
  const closeDelay = options.closeDelayMs ?? HOVER_CLOSE_DELAY_MS;
  let openTimer: ReturnType<typeof setTimeout> | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingId: string | null = null;
  let openedId: string | null = null;

  function clearOpen() {
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
    pendingId = null;
  }

  function clearClose() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  return {
    enter(id: string) {
      clearClose();
      if (openedId === id || pendingId === id) return;
      clearOpen();
      pendingId = id;
      openTimer = setTimeout(() => {
        openTimer = null;
        pendingId = null;
        openedId = id;
        options.onOpen(id);
      }, openDelay);
    },
    leave() {
      clearOpen();
      clearClose();
      closeTimer = setTimeout(() => {
        closeTimer = null;
        openedId = null;
        options.onClose();
      }, closeDelay);
    },
    hold() {
      clearClose();
    },
    cancelOpen() {
      clearOpen();
    },
    dispose() {
      clearOpen();
      clearClose();
      openedId = null;
    },
  };
}
