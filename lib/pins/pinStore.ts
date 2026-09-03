/**
 * Session pin/pop-out windows: documents, link cards, PDFs, and the Bible reader.
 * Document helpers keep the Phase A0 API (`openPopOut`, etc.).
 */

import { navigateBibleApp, queueBibleSearch } from "@/lib/bible/bridge";
import { BIBLE_PIN_ID } from "@/lib/bible/constants";

export type PinKind =
  | "document"
  | "link"
  | "pdf"
  | "shell"
  | "toolPanel"
  | "bible";

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
  /** Session-only: load the reader extract as soon as the pin mounts. */
  autoExtract?: boolean;
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

/** Floating Files / AI / Library panels. */
export type ToolPanelPin = PinBase & {
  kind: "toolPanel";
  panelId: "files" | "ai" | "library";
};

/** fetch(bible) web app reader. */
export type BiblePin = PinBase & {
  kind: "bible";
};

export type PinWindow =
  | DocumentPin
  | LinkPin
  | PdfPin
  | ShellPin
  | ToolPanelPin
  | BiblePin;

export const SHELL_PIN_ID = "shell:inbox";

export function toolPanelPinId(
  panelId: "files" | "ai" | "library"
): string {
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
let hydrated = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const PIN_LAYOUT_KEY = "blogide.pinLayout.v1";

export type PersistedPin =
  | {
      kind: "document";
      nodeId: string;
      title: string;
      left: number;
      top: number;
      width: number;
      height: number;
    }
  | {
      kind: "link";
      url: string;
      title: string;
      description?: string;
      siteName?: string;
      image?: string | null;
      left: number;
      top: number;
      width: number;
      height: number;
    }
  | {
      kind: "bible";
      title: string;
      left: number;
      top: number;
      width: number;
      height: number;
    };

export function persistablePin(window: PinWindow): PersistedPin | null {
  if (window.kind === "document") {
    return {
      kind: "document",
      nodeId: window.nodeId,
      title: window.title,
      left: window.left,
      top: window.top,
      width: window.width,
      height: window.height,
    };
  }
  if (window.kind === "link") {
    return {
      kind: "link",
      url: window.url,
      title: window.title,
      description: window.description,
      siteName: window.siteName,
      image: window.image,
      left: window.left,
      top: window.top,
      width: window.width,
      height: window.height,
    };
  }
  if (window.kind === "bible") {
    return {
      kind: "bible",
      title: window.title,
      left: window.left,
      top: window.top,
      width: window.width,
      height: window.height,
    };
  }
  return null;
}

export function parsePersistedPins(raw: unknown): PersistedPin[] {
  if (!Array.isArray(raw)) return [];
  const out: PersistedPin[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const left = Number(rec.left);
    const top = Number(rec.top);
    const width = Number(rec.width);
    const height = Number(rec.height);
    if (![left, top, width, height].every((n) => Number.isFinite(n))) continue;
    if (rec.kind === "document" && typeof rec.nodeId === "string" && rec.nodeId) {
      out.push({
        kind: "document",
        nodeId: rec.nodeId,
        title: typeof rec.title === "string" ? rec.title : "Document",
        left,
        top,
        width,
        height,
      });
    } else if (rec.kind === "link" && typeof rec.url === "string" && rec.url) {
      out.push({
        kind: "link",
        url: rec.url,
        title: typeof rec.title === "string" ? rec.title : rec.url,
        description:
          typeof rec.description === "string" ? rec.description : undefined,
        siteName: typeof rec.siteName === "string" ? rec.siteName : undefined,
        image: typeof rec.image === "string" ? rec.image : null,
        left,
        top,
        width,
        height,
      });
    } else if (rec.kind === "bible") {
      out.push({
        kind: "bible",
        title: typeof rec.title === "string" ? rec.title : "Bible",
        left,
        top,
        width,
        height,
      });
    }
  }
  return out;
}

export function serializePersistedPins(open: PinWindow[]): PersistedPin[] {
  return open
    .map(persistablePin)
    .filter((row): row is PersistedPin => row != null);
}

function hydratePinLayout() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(PIN_LAYOUT_KEY);
    if (!raw) return;
    const parsed = parsePersistedPins(JSON.parse(raw) as unknown);
    const restored: PinWindow[] = [];
    for (const rec of parsed) {
      const geometry = clampGeometry({
        left: rec.left,
        top: rec.top,
        width: rec.width,
        height: rec.height,
      });
      if (rec.kind === "document") {
        restored.push({
          id: `doc:${rec.nodeId}`,
          kind: "document",
          nodeId: rec.nodeId,
          title: rec.title || "Document",
          ...geometry,
          zIndex: claimFloatZ(),
        });
      } else if (rec.kind === "bible") {
        restored.push({
          id: BIBLE_PIN_ID,
          kind: "bible",
          title: rec.title || "Bible",
          ...geometry,
          zIndex: claimFloatZ(),
        });
      } else {
        restored.push({
          id: `link:${rec.url}`,
          kind: "link",
          url: rec.url,
          title: rec.title || rec.url,
          description: rec.description,
          siteName: rec.siteName,
          image: rec.image,
          ...geometry,
          zIndex: claimFloatZ(),
        });
      }
    }
    if (restored.length) windows = restored;
  } catch {
    /* ignore quota / private mode / bad JSON */
  }
}

function persistPinLayout() {
  if (typeof window === "undefined") return;
  const payload = serializePersistedPins(windows);
  try {
    sessionStorage.setItem(PIN_LAYOUT_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

function emit() {
  for (const listener of listeners) listener();
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistPinLayout();
  }, 120);
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
  hydratePinLayout();
  return windows;
}

export function subscribePinWindows(listener: Listener): () => void {
  hydratePinLayout();
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
  hydratePinLayout();
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
  hydratePinLayout();
  if (!windows.some((w) => w.id === id)) return;
  raiseId(id);
}

export function updatePin(
  id: string,
  patch: Partial<Geometry & { title: string }>
): void {
  hydratePinLayout();
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
  hydratePinLayout();
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
  autoExtract?: boolean;
}): void {
  hydratePinLayout();
  const id = `link:${input.url}`;
  const existing = windows.find((w) => w.id === id);
  if (existing && existing.kind === "link") {
    if (input.autoExtract && !existing.autoExtract) {
      windows = windows.map((w) =>
        w.id === id && w.kind === "link" ? { ...w, autoExtract: true } : w
      );
      emit();
    }
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
      autoExtract: input.autoExtract === true,
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
  hydratePinLayout();
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

export function openBiblePin(input?: {
  search?: string;
  title?: string;
}): void {
  hydratePinLayout();
  if (input?.search) {
    queueBibleSearch(input.search);
    navigateBibleApp(input.search);
  }
  const existing = windows.find((w) => w.id === BIBLE_PIN_ID);
  const title = input?.title
    ? `Bible · ${input.title}`
    : existing?.title ?? "Bible";
  if (existing) {
    windows = windows.map((w) =>
      w.id === BIBLE_PIN_ID ? { ...w, title } : w
    );
    raiseId(BIBLE_PIN_ID);
    return;
  }
  windows = [
    ...windows,
    {
      id: BIBLE_PIN_ID,
      kind: "bible",
      title,
      ...defaultPlacement({ width: 400, height: 560 }),
      zIndex: claimFloatZ(),
    },
  ];
  emit();
}

export function closeBiblePin(): void {
  closePin(BIBLE_PIN_ID);
}

export function isBiblePinOpen(): boolean {
  return windows.some((w) => w.id === BIBLE_PIN_ID);
}

/** Floating Pushbullet / iMessage-style Notes Shell. */
export function openShellPin(): void {
  hydratePinLayout();
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
      title: "Shell · Notes",
      // Default to a chat-width column; users can resize freely when floated.
      ...defaultPlacement({ width: 360, height: 480 }),
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

export function isToolPanelPinOpen(
  panelId: "files" | "ai" | "library"
): boolean {
  return windows.some((w) => w.id === toolPanelPinId(panelId));
}

export function isDockablePanelPinOpen(
  panelId: "files" | "ai" | "shell" | "library"
): boolean {
  if (panelId === "shell") return isShellPinOpen();
  return isToolPanelPinOpen(panelId);
}

export function openToolPanelPin(
  panelId: "files" | "ai" | "library",
  title: string
): void {
  hydratePinLayout();
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
        width: panelId === "files" ? 280 : panelId === "library" ? 420 : 360,
        height: 520,
      }),
      zIndex: claimFloatZ(),
    },
  ];
  emit();
}

export function closeToolPanelPin(
  panelId: "files" | "ai" | "library"
): void {
  closePin(toolPanelPinId(panelId));
}

export function closeDockablePanelPin(
  panelId: "files" | "ai" | "shell" | "library"
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
