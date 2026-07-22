/**
 * IDE-style dockable panel layout (left / right / bottom tabs).
 * Pure helpers — AppShell owns prefs persistence.
 */

export type PanelId = "files" | "ai" | "shell" | "library";
export type DockSide = "left" | "right" | "bottom";

export type PanelLayout = {
  docks: Record<DockSide, PanelId[]>;
  active: Record<DockSide, PanelId | null>;
  visible: Record<PanelId, boolean>;
  floating: PanelId[];
  /** Last docked side — used when re-showing a closed panel. */
  home: Record<PanelId, DockSide>;
  sizes: { left: number; right: number; bottom: number };
};

export const PANEL_IDS: PanelId[] = ["files", "ai", "shell", "library"];

export const PANEL_LABELS: Record<PanelId, string> = {
  files: "Files",
  ai: "AI assistant",
  // Internal id stays "shell"; the panel is a view of the Notes (inbox)
  // folder's capture channels.
  shell: "Notes",
  library: "Library",
};

export const DOCK_SIDES: DockSide[] = ["left", "right", "bottom"];

export const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  docks: {
    left: ["files"],
    right: ["shell", "ai"],
    bottom: [],
  },
  active: {
    left: "files",
    right: "shell",
    bottom: null,
  },
  visible: {
    files: true,
    ai: true,
    shell: true,
    library: false,
  },
  floating: [],
  home: {
    files: "left",
    ai: "right",
    shell: "right",
    library: "right",
  },
  sizes: {
    left: 240,
    right: 320,
    bottom: 220,
  },
};

function cloneLayout(layout: PanelLayout): PanelLayout {
  return {
    docks: {
      left: [...layout.docks.left],
      right: [...layout.docks.right],
      bottom: [...layout.docks.bottom],
    },
    active: { ...layout.active },
    visible: { ...layout.visible },
    floating: [...layout.floating],
    home: { ...layout.home },
    sizes: { ...layout.sizes },
  };
}

function removeFromAllDocks(layout: PanelLayout, id: PanelId): void {
  for (const side of DOCK_SIDES) {
    const idx = layout.docks[side].indexOf(id);
    if (idx === -1) continue;
    layout.docks[side].splice(idx, 1);
    if (layout.active[side] === id) {
      layout.active[side] = layout.docks[side][0] ?? null;
    }
  }
}

function findDockSide(layout: PanelLayout, id: PanelId): DockSide | null {
  for (const side of DOCK_SIDES) {
    if (layout.docks[side].includes(id)) return side;
  }
  return null;
}

/** Normalize partial / corrupted layout into a full PanelLayout. */
export function normalizePanelLayout(
  partial?: Partial<PanelLayout> | null
): PanelLayout {
  const base = cloneLayout(DEFAULT_PANEL_LAYOUT);
  if (!partial) return base;

  if (partial.sizes) {
    base.sizes = { ...base.sizes, ...partial.sizes };
  }
  if (partial.home) {
    base.home = { ...base.home, ...partial.home };
  }
  if (partial.visible) {
    base.visible = { ...base.visible, ...partial.visible };
  }
  if (Array.isArray(partial.floating)) {
    base.floating = partial.floating.filter((id): id is PanelId =>
      PANEL_IDS.includes(id)
    );
  }
  if (partial.docks) {
    for (const side of DOCK_SIDES) {
      const list = partial.docks[side];
      if (Array.isArray(list)) {
        base.docks[side] = list.filter((id): id is PanelId =>
          PANEL_IDS.includes(id)
        );
      }
    }
  }
  if (partial.active) {
    for (const side of DOCK_SIDES) {
      const id = partial.active[side];
      if (id == null) {
        base.active[side] = base.docks[side][0] ?? null;
      } else if (
        PANEL_IDS.includes(id) &&
        base.docks[side].includes(id)
      ) {
        base.active[side] = id;
      } else {
        base.active[side] = base.docks[side][0] ?? null;
      }
    }
  }

  // Ensure each visible non-floating panel appears in exactly one dock.
  for (const id of PANEL_IDS) {
    const floating = base.floating.includes(id);
    if (floating) {
      base.visible[id] = false;
      removeFromAllDocks(base, id);
      continue;
    }
    if (!base.visible[id]) {
      removeFromAllDocks(base, id);
      continue;
    }
    const side = findDockSide(base, id) ?? base.home[id];
    removeFromAllDocks(base, id);
    if (!base.docks[side].includes(id)) {
      base.docks[side].push(id);
    }
    base.home[id] = side;
    if (!base.active[side]) base.active[side] = id;
  }

  return base;
}

/** Build layout from legacy leftOpen / rightOpen / shellOpen prefs. */
export function panelLayoutFromLegacy(prefs: {
  leftOpen?: boolean;
  rightOpen?: boolean;
  shellOpen?: boolean;
  leftWidth?: number;
  rightWidth?: number;
  shellHeight?: number;
  panelLayout?: Partial<PanelLayout> | null;
}): PanelLayout {
  if (prefs.panelLayout) {
    const normalized = normalizePanelLayout(prefs.panelLayout);
    // Prefer live size fields when present (resize still writes them).
    return {
      ...normalized,
      sizes: {
        left: prefs.leftWidth ?? normalized.sizes.left,
        right: prefs.rightWidth ?? normalized.sizes.right,
        bottom: prefs.shellHeight ?? normalized.sizes.bottom,
      },
    };
  }

  const layout = cloneLayout(DEFAULT_PANEL_LAYOUT);
  layout.sizes = {
    left: prefs.leftWidth ?? layout.sizes.left,
    right: prefs.rightWidth ?? layout.sizes.right,
    bottom: prefs.shellHeight ?? layout.sizes.bottom,
  };
  layout.visible.files = prefs.leftOpen !== false;
  layout.visible.ai = prefs.rightOpen !== false;
  layout.visible.shell = Boolean(prefs.shellOpen);
  if (!layout.visible.files) {
    layout.docks.left = [];
    layout.active.left = null;
  }
  if (!layout.visible.ai) {
    layout.docks.right = [];
    layout.active.right = null;
  }
  if (layout.visible.shell) {
    layout.docks.bottom = ["shell"];
    layout.active.bottom = "shell";
  }
  return layout;
}

export function dockHasVisiblePanels(
  layout: PanelLayout,
  side: DockSide
): boolean {
  return layout.docks[side].some((id) => layout.visible[id]);
}

export function visibleTabs(
  layout: PanelLayout,
  side: DockSide
): PanelId[] {
  return layout.docks[side].filter((id) => layout.visible[id]);
}

export function setActiveTab(
  layout: PanelLayout,
  side: DockSide,
  id: PanelId
): PanelLayout {
  const next = cloneLayout(layout);
  if (!next.docks[side].includes(id) || !next.visible[id]) return layout;
  next.active[side] = id;
  return next;
}

export function movePanel(
  layout: PanelLayout,
  id: PanelId,
  to: DockSide
): PanelLayout {
  const next = cloneLayout(layout);
  next.floating = next.floating.filter((p) => p !== id);
  removeFromAllDocks(next, id);
  next.visible[id] = true;
  next.home[id] = to;
  if (!next.docks[to].includes(id)) next.docks[to].push(id);
  next.active[to] = id;
  return next;
}

export function popOutPanel(layout: PanelLayout, id: PanelId): PanelLayout {
  const next = cloneLayout(layout);
  const side = findDockSide(next, id);
  if (side) next.home[id] = side;
  removeFromAllDocks(next, id);
  next.visible[id] = false;
  if (!next.floating.includes(id)) next.floating.push(id);
  return next;
}

export function popInPanel(
  layout: PanelLayout,
  id: PanelId,
  to: DockSide
): PanelLayout {
  return movePanel(
    {
      ...layout,
      floating: layout.floating.filter((p) => p !== id),
    },
    id,
    to
  );
}

export function closePanel(layout: PanelLayout, id: PanelId): PanelLayout {
  const next = cloneLayout(layout);
  const side = findDockSide(next, id);
  if (side) next.home[id] = side;
  removeFromAllDocks(next, id);
  next.visible[id] = false;
  next.floating = next.floating.filter((p) => p !== id);
  return next;
}

export function showPanel(
  layout: PanelLayout,
  id: PanelId,
  side?: DockSide
): PanelLayout {
  const next = cloneLayout(layout);
  next.floating = next.floating.filter((p) => p !== id);
  const target = side ?? next.home[id] ?? DEFAULT_PANEL_LAYOUT.home[id];
  removeFromAllDocks(next, id);
  next.visible[id] = true;
  next.home[id] = target;
  if (!next.docks[target].includes(id)) next.docks[target].push(id);
  next.active[target] = id;
  return next;
}

export function togglePanel(layout: PanelLayout, id: PanelId): PanelLayout {
  if (layout.floating.includes(id)) {
    return closePanel(layout, id);
  }
  if (layout.visible[id] && findDockSide(layout, id)) {
    return closePanel(layout, id);
  }
  return showPanel(layout, id);
}

export function setDockSize(
  layout: PanelLayout,
  side: DockSide,
  size: number
): PanelLayout {
  const next = cloneLayout(layout);
  if (side === "left") next.sizes.left = size;
  else if (side === "right") next.sizes.right = size;
  else next.sizes.bottom = size;
  return next;
}

export function isPanelDocked(layout: PanelLayout, id: PanelId): boolean {
  return layout.visible[id] && findDockSide(layout, id) != null;
}

export function isPanelFloating(layout: PanelLayout, id: PanelId): boolean {
  return layout.floating.includes(id);
}
