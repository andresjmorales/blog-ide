/**
 * Session pin/pop-out windows: documents, link cards, and PDFs.
 * Document helpers keep the Phase A0 API (`openPopOut`, etc.).
 */

export type PinKind = "document" | "link" | "pdf";

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

export type PinWindow = DocumentPin | LinkPin | PdfPin;

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
  nextZ += 1;
  windows = windows.map((w) =>
    w.id === id ? { ...w, zIndex: nextZ } : w
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
  nextZ += 1;
  windows = [
    ...windows,
    {
      id,
      kind: "document",
      nodeId,
      title,
      ...defaultPlacement(),
      zIndex: nextZ,
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
  nextZ += 1;
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
      zIndex: nextZ,
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
  nextZ += 1;
  windows = [
    ...windows,
    {
      id,
      kind: "pdf",
      src: input.src,
      title: input.title,
      revokeOnClose: input.revokeOnClose,
      ...defaultPlacement({ width: 440, height: 560 }),
      zIndex: nextZ,
    },
  ];
  emit();
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
