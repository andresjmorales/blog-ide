/**
 * Session pin/pop-out windows: documents, link cards, and PDFs.
 * Document helpers keep the Phase A0 API (`openPopOut`, etc.).
 */

export type PinKind = "document" | "link" | "pdf" | "shell" | "toolPanel";

type Geometry = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PinBase = Geometry & {
  id: string;
  title: string;
  zIndex: number;
};

export type DocumentPin = PinBase & {
  kind: "document";
  nodeId: string;
};

export type LinkPin = PinBase & {
  kind: "link";
  url: string;
  description?: string;
  siteName?: string;
  image?: string | null;
};

export type PdfPin = PinBase & {
  kind: "pdf";
  /** blob: or https: URL for the PDF bytes */
  src: string;
  /** Revoke on close when this was created from a local file */
  revokeOnClose?: boolean;
};

export type ShellPin = PinBase & {
  kind: "shell";
};

/** Floating Files / AI assistant panels. */
export type ToolPanelPin = PinBase & {
  kind: "toolPanel";
  panelId: "files" | "ai";
};

export type PinWindow =
  | DocumentPin
  | LinkPin
  | PdfPin
  | ShellPin
  | ToolPanelPin;

export const SHELL_PIN_ID = "shell:inbox";

export function toolPanelPinId(panelId: "files" | "ai"): string {
  return `toolPanel:${panelId}`;
}

/** @deprecated Use DocumentPin / PinWindow — kept for PopOutDocument props. */
export type PopOutWindow = DocumentPin;

type Listener = () => void;

const DEFAULT_WIDTH = 380;
const DEFAULT_HEIGHT = 480;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 200;

let windows: PinWindow[] = [];
let nextZ = 40;
let cascade = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

/** Shared stacking for pins + footnote cards — always above previous floats. */
export function claimFloatZ(): number {
  nextZ += 1;
  return nextZ;
}

function clampGeometry(partial: Partial<Geometry>): Geometry {
  const maxW =
    typeof window !== "undefined" ? window.innerWidth : DEFAULT_WIDTH + 40;
  const maxH =
    typeof window !== "undefined" ? window.innerHeight : DEFAULT_HEIGHT + 40;
  const width = Math.min(
    maxW - 16,
    Math.max(MIN_WIDTH, partial.width ?? DEFAULT_WIDTH)
  );
  const height = Math.min(
    maxH - 16,
    Math.max(MIN_HEIGHT, partial.height ?? DEFAULT_HEIGHT)
  );
  const left = Math.min(maxW - width - 8, Math.max(8, partial.left ?? 48));
  const top = Math.min(maxH - 48, Math.max(8, partial.top ?? 64));
  return { left, top, width, height };
}

function defaultPlacement(size?: Partial<Geometry>): Geometry {
  const offset = (cascade % 6) * 28;
  cascade += 1;
  return clampGeometry({
    left: 72 + offset,
    top: 72 + offset,
    width: size?.width ?? DEFAULT_WIDTH,
    height: size?.height ?? DEFAULT_HEIGHT,
  });
}

export function getPinWindows(): PinWindow[] {
  return windows;
}

export function subscribePinWindows(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function raiseId(id: string) {
  const zIndex = claimFloatZ();
  windows = windows.map((w) =>
    w.id === id ? { ...w, zIndex } : w
  );
  emit();
}

export function closePin(id: string): void {
  const closing = windows.find((w) => w.id === id);
  if (closing?.kind === "pdf" && closing.revokeOnClose && closing.src.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(closing.src);
    } catch {
      /* ignore */
    }
  }
  const next = windows.filter((w) => w.id !== id);
  if (next.length === windows.length) return;
  windows = next;
  emit();
}

export function raisePin(id: string): void {
  if (!windows.some((w) => w.id === id)) return;
  raiseId(id);
}

export function updatePin(
  id: string,
  patch: Partial<Geometry & { title: string }>
): void {
  windows = windows.map((w) => {
    if (w.id !== id) return w;
    const geometry = clampGeometry({
      left: patch.left ?? w.left,
      top: patch.top ?? w.top,
      width: patch.width ?? w.width,
      height: patch.height ?? w.height,
    });
    return {
      ...w,
      ...geometry,
      title: patch.title ?? w.title,
    };
  });
  emit();
}

export function openDocumentPin(nodeId: string, title: string): void {
  const id = `doc:${nodeId}`;
  const existing = windows.find((w) => w.id === id);
  if (existing) {
    windows = windows.map((w) =>
      w.id === id ? { ...w, title } : w
    );
    raiseId(id);
    return;
  }
  windows = [
    ...windows,
    {
      id,
      kind: "document",
      nodeId,
      title,
      ...defaultPlacement(),
      zIndex: claimFloatZ(),
    },
  ];
  emit();
}

export function openLinkPin(input: {
  url: string;
  title: string;
  description?: string;
  siteName?: string;
  image?: string | null;
}): void {
  const id = `link:${input.url}`;
  const existing = windows.find((w) => w.id === id);
  if (existing) {
    raiseId(id);
    return;
  }
  windows = [
    ...windows,
    {
      id,
      kind: "link",
      url: input.url,
      title: input.title || input.url,
      description: input.description,
      siteName: input.siteName,
      image: input.image,
      ...defaultPlacement({ width: 360, height: 320 }),
      zIndex: claimFloatZ(),
    },
  ];
  emit();
}

export function openPdfPin(input: {
  src: string;
  title: string;
  revokeOnClose?: boolean;
}): void {
  const id = `pdf:${input.src}`;
  const existing = windows.find((w) => w.id === id);
  if (existing) {
    raiseId(id);
    return;
  }
  windows = [
    ...windows,
    {
      id,
      kind: "pdf",
      src: input.src,
      title: input.title,
      revokeOnClose: input.revokeOnClose,
      ...defaultPlacement({ width: 440, height: 560 }),
      zIndex: claimFloatZ(),
    },
  ];
  emit();
}

/** Floating Pushbullet / iMessage-style Inbox Shell. */
export function openShellPin(): void {
  const existing = windows.find((w) => w.id === SHELL_PIN_ID);
  if (existing) {
    raiseId(SHELL_PIN_ID);
    return;
  }
  windows = [
    ...windows,
    {
      id: SHELL_PIN_ID,
      kind: "shell",
      title: "Shell · Inbox",
      // Narrow chat column — short notes don't need editor-width chrome.
      ...defaultPlacement({ width: 320, height: 480 }),
      zIndex: claimFloatZ(),
    },
  ];
  emit();
}

export function closeShellPin(): void {
  closePin(SHELL_PIN_ID);
}

export function isShellPinOpen(): boolean {
  return windows.some((w) => w.id === SHELL_PIN_ID);
}

export function openToolPanelPin(
  panelId: "files" | "ai",
  title: string
): void {
  const id = toolPanelPinId(panelId);
  const existing = windows.find((w) => w.id === id);
  if (existing) {
    windows = windows.map((w) => (w.id === id ? { ...w, title } : w));
    raiseId(id);
    return;
  }
  windows = [
    ...windows,
    {
      id,
      kind: "toolPanel",
      panelId,
      title,
      ...defaultPlacement({
        width: panelId === "files" ? 280 : 360,
        height: 520,
      }),
      zIndex: claimFloatZ(),
    },
  ];
  emit();
}

export function closeToolPanelPin(panelId: "files" | "ai"): void {
  closePin(toolPanelPinId(panelId));
}

export function closeDockablePanelPin(
  panelId: "files" | "ai" | "shell"
): void {
  if (panelId === "shell") closeShellPin();
  else closeToolPanelPin(panelId);
}

/* —— Phase A0 aliases —— */

export function getPopOutWindows(): DocumentPin[] {
  return windows.filter((w): w is DocumentPin => w.kind === "document");
}

export function subscribePopOutWindows(listener: Listener): () => void {
  return subscribePinWindows(listener);
}

export function openPopOut(nodeId: string, title: string): void {
  openDocumentPin(nodeId, title);
}

export function closePopOut(nodeId: string): void {
  closePin(`doc:${nodeId}`);
}

export function raisePopOut(nodeId: string): void {
  raisePin(`doc:${nodeId}`);
}

export function updatePopOut(
  nodeId: string,
  patch: Partial<Geometry & { title: string }>
): void {
  updatePin(`doc:${nodeId}`, patch);
}

export const POP_OUT_MIN_WIDTH = MIN_WIDTH;
export const POP_OUT_MIN_HEIGHT = MIN_HEIGHT;
