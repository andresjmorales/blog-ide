/**
 * User-orderable essay toolbar. Slots are visible items, dividers, or the
 * single Aa+ overflow folder. Items not in the layout sit in the unused pool.
 */

export const TOOLBAR_ITEM_IDS = [
  "undo",
  "redo",
  "heading",
  "bullet",
  "ordered",
  "bold",
  "italic",
  "strike",
  "code",
  "blockquote",
  "link",
  "superscript",
  "subscript",
  "codeBlock",
  "case",
  "chars",
  "image",
  "hr",
  "table",
  "tex",
  "footnote",
  "cite",
  "find",
  "cleanup",
] as const;

export type ToolbarItemId = (typeof TOOLBAR_ITEM_IDS)[number];

export type ToolbarItemSlot = { type: "item"; id: ToolbarItemId };
export type ToolbarDividerSlot = { type: "divider"; id: string };
export type ToolbarOverflowSlot = { type: "overflow"; items: ToolbarItemId[] };
export type ToolbarSlot =
  | ToolbarItemSlot
  | ToolbarDividerSlot
  | ToolbarOverflowSlot;

export type ToolbarLayout = ToolbarSlot[];

export const TOOLBAR_ITEM_LABELS: Record<ToolbarItemId, string> = {
  undo: "Undo",
  redo: "Redo",
  heading: "Paragraph style",
  bullet: "Bullet list",
  ordered: "Ordered list",
  bold: "Bold",
  italic: "Italic",
  strike: "Strikethrough",
  code: "Inline code",
  blockquote: "Blockquote",
  link: "Link",
  superscript: "Superscript",
  subscript: "Subscript",
  codeBlock: "Code block",
  case: "Convert case",
  chars: "Special characters",
  image: "Image",
  hr: "Divider",
  table: "Table",
  tex: "TeX",
  footnote: "Footnote",
  cite: "Cite",
  find: "Find",
  cleanup: "Cleanup",
};

/** Items that render as their own menus rather than a single toggle. */
export const TOOLBAR_SLOT_ITEMS = new Set<ToolbarItemId>([
  "heading",
  "chars",
  "image",
  "case",
]);

export const DEFAULT_TOOLBAR_LAYOUT: ToolbarLayout = [
  { type: "item", id: "undo" },
  { type: "item", id: "redo" },
  { type: "divider", id: "div-history" },
  { type: "item", id: "heading" },
  { type: "item", id: "bullet" },
  { type: "item", id: "ordered" },
  { type: "divider", id: "div-blocks" },
  { type: "item", id: "bold" },
  { type: "item", id: "italic" },
  { type: "item", id: "strike" },
  { type: "item", id: "blockquote" },
  { type: "item", id: "link" },
  {
    type: "overflow",
    items: ["code", "superscript", "subscript", "codeBlock", "case"],
  },
  { type: "divider", id: "div-insert" },
  { type: "item", id: "chars" },
  { type: "item", id: "image" },
  { type: "item", id: "hr" },
  { type: "item", id: "table" },
  { type: "item", id: "tex" },
  { type: "item", id: "footnote" },
  { type: "item", id: "cite" },
  { type: "divider", id: "div-tools" },
  { type: "item", id: "find" },
  { type: "item", id: "cleanup" },
];

const ITEM_ID_SET = new Set<string>(TOOLBAR_ITEM_IDS);

export function isToolbarItemId(value: unknown): value is ToolbarItemId {
  return typeof value === "string" && ITEM_ID_SET.has(value);
}

export function defaultOverflowItems(): ToolbarItemId[] {
  const overflow = DEFAULT_TOOLBAR_LAYOUT.find(
    (slot) => slot.type === "overflow"
  );
  return overflow && overflow.type === "overflow" ? [...overflow.items] : [];
}

function newDividerId(): string {
  return `div-${Math.random().toString(36).slice(2, 10)}`;
}

function collectUsedIds(layout: ToolbarLayout): Set<ToolbarItemId> {
  const used = new Set<ToolbarItemId>();
  for (const slot of layout) {
    if (slot.type === "item") used.add(slot.id);
    if (slot.type === "overflow") {
      for (const id of slot.items) used.add(id);
    }
  }
  return used;
}

export function unusedToolbarItems(layout: ToolbarLayout): ToolbarItemId[] {
  const used = collectUsedIds(layout);
  return TOOLBAR_ITEM_IDS.filter((id) => !used.has(id));
}

export function overflowSlot(layout: ToolbarLayout): ToolbarOverflowSlot | null {
  const slot = layout.find((item) => item.type === "overflow");
  return slot && slot.type === "overflow" ? slot : null;
}

/**
 * Repair a persisted layout: drop unknown/duplicate ids, keep one overflow
 * folder, collapse extra dividers, and park new items in the unused pool.
 */
export function normalizeToolbarLayout(input: unknown): ToolbarLayout {
  const raw = Array.isArray(input) ? input : DEFAULT_TOOLBAR_LAYOUT;
  const seen = new Set<ToolbarItemId>();
  const overflowItems: ToolbarItemId[] = [];
  let hasOverflow = false;
  const next: ToolbarLayout = [];
  let dividerCount = 0;

  function takeItem(id: unknown): ToolbarItemId | null {
    if (!isToolbarItemId(id) || seen.has(id)) return null;
    seen.add(id);
    return id;
  }

  for (const slot of raw) {
    if (!slot || typeof slot !== "object") continue;
    const type = (slot as { type?: unknown }).type;
    if (type === "item") {
      const id = takeItem((slot as { id?: unknown }).id);
      if (id) next.push({ type: "item", id });
      continue;
    }
    if (type === "divider") {
      dividerCount += 1;
      const rawId = (slot as { id?: unknown }).id;
      const id =
        typeof rawId === "string" && rawId.trim()
          ? rawId
          : `div-${dividerCount}`;
      next.push({ type: "divider", id });
      continue;
    }
    if (type === "overflow") {
      const items = (slot as { items?: unknown }).items;
      if (Array.isArray(items)) {
        for (const id of items) {
          const taken = takeItem(id);
          if (taken) overflowItems.push(taken);
        }
      }
      if (!hasOverflow) {
        hasOverflow = true;
        next.push({ type: "overflow", items: overflowItems });
      }
    }
  }

  if (!hasOverflow) {
    const linkIdx = next.findIndex(
      (slot) => slot.type === "item" && slot.id === "link"
    );
    const overflow: ToolbarOverflowSlot = { type: "overflow", items: overflowItems };
    if (linkIdx >= 0) next.splice(linkIdx + 1, 0, overflow);
    else next.push(overflow);
  } else {
    const overflow = next.find((slot) => slot.type === "overflow");
    if (overflow && overflow.type === "overflow") {
      overflow.items = overflowItems;
    }
  }

  return collapseDividers(dedupeDividerIds(next));
}

function dedupeDividerIds(layout: ToolbarLayout): ToolbarLayout {
  const seen = new Set<string>();
  return layout.map((slot) => {
    if (slot.type !== "divider") return slot;
    let id = slot.id;
    if (!id || seen.has(id)) id = newDividerId();
    seen.add(id);
    return { type: "divider", id };
  });
}

function collapseDividers(layout: ToolbarLayout): ToolbarLayout {
  const next: ToolbarLayout = [];
  for (const slot of layout) {
    if (slot.type === "divider") {
      if (next.length === 0) continue;
      if (next[next.length - 1]?.type === "divider") continue;
      next.push(slot);
      continue;
    }
    next.push(slot);
  }
  while (next[next.length - 1]?.type === "divider") next.pop();
  return next;
}

export function layoutsEqual(a: ToolbarLayout, b: ToolbarLayout): boolean {
  return JSON.stringify(normalizeToolbarLayout(a)) ===
    JSON.stringify(normalizeToolbarLayout(b));
}

export type ToolbarZone = "bar" | "overflow" | "unused";

export type ToolbarLocation = {
  zone: ToolbarZone;
  index: number;
};

export type ToolbarDropKey = `${ToolbarZone}:${number | "end"}`;

export function parseToolbarDropKey(
  key: string | undefined | null,
  lengths: { bar: number; overflow: number; unused: number }
): ToolbarLocation | null {
  if (!key) return null;
  const [zone, raw] = key.split(":");
  if (zone !== "bar" && zone !== "overflow" && zone !== "unused") return null;
  const index =
    raw === "end" ? lengths[zone] : Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(index) || index < 0) return null;
  return { zone, index };
}

export function toolbarSourceKey(source: ToolbarLocation): string {
  return `${source.zone}:${source.index}`;
}

/**
 * Prefer a chip under the pointer over the strip's `:end` catch-all.
 * HTML5 DnD and `elementFromPoint` both miss chips in Firefox and report
 * the parent strip instead, which always appended the held item.
 */
export function preferToolbarDropKey(
  keys: Array<string | null | undefined>,
  sourceKey: string
): string | undefined {
  const clean = keys.filter((key): key is string => Boolean(key));
  const chip = clean.find((key) => key !== sourceKey && !key.endsWith(":end"));
  if (chip) return chip;
  return clean.find((key) => key.endsWith(":end"));
}

function takeFromZone(
  layout: ToolbarLayout,
  unused: ToolbarItemId[],
  source: ToolbarLocation
): {
  layout: ToolbarLayout;
  unused: ToolbarItemId[];
  payload:
    | { kind: "item"; id: ToolbarItemId }
    | { kind: "divider"; id: string }
    | { kind: "overflow"; items: ToolbarItemId[] }
    | null;
} {
  if (source.zone === "unused") {
    const id = unused[source.index];
    if (!id) return { layout, unused, payload: null };
    return {
      layout,
      unused: unused.filter((_, i) => i !== source.index),
      payload: { kind: "item", id },
    };
  }
  if (source.zone === "overflow") {
    const overflow = overflowSlot(layout);
    const id = overflow?.items[source.index];
    if (!overflow || !id) return { layout, unused, payload: null };
    return {
      layout: layout.map((slot) =>
        slot.type === "overflow"
          ? { ...slot, items: slot.items.filter((_, i) => i !== source.index) }
          : slot
      ),
      unused,
      payload: { kind: "item", id },
    };
  }
  const slot = layout[source.index];
  if (!slot) return { layout, unused, payload: null };
  return {
    layout: layout.filter((_, i) => i !== source.index),
    unused,
    payload:
      slot.type === "item"
        ? { kind: "item", id: slot.id }
        : slot.type === "divider"
          ? { kind: "divider", id: slot.id }
          : { kind: "overflow", items: slot.items },
  };
}

function insertIntoZone(
  layout: ToolbarLayout,
  unused: ToolbarItemId[],
  dest: ToolbarLocation,
  payload: NonNullable<ReturnType<typeof takeFromZone>["payload"]>
): { layout: ToolbarLayout; unused: ToolbarItemId[] } {
  if (payload.kind === "overflow") {
    if (dest.zone !== "bar") {
      return {
        layout: normalizeToolbarLayout([...layout, { type: "overflow", items: payload.items }]),
        unused,
      };
    }
    const next = [...layout];
    next.splice(dest.index, 0, { type: "overflow", items: payload.items });
    return { layout: normalizeToolbarLayout(next), unused };
  }
  if (payload.kind === "divider") {
    if (dest.zone !== "bar") {
      return { layout: normalizeToolbarLayout(layout), unused };
    }
    const next = [...layout];
    next.splice(dest.index, 0, { type: "divider", id: payload.id });
    return { layout: normalizeToolbarLayout(next), unused };
  }
  if (dest.zone === "unused") {
    const nextUnused = [...unused];
    nextUnused.splice(Math.min(dest.index, nextUnused.length), 0, payload.id);
    return { layout: normalizeToolbarLayout(layout), unused: nextUnused };
  }
  if (dest.zone === "overflow") {
    const overflow = overflowSlot(layout);
    if (!overflow) {
      return {
        layout: normalizeToolbarLayout([
          ...layout,
          { type: "overflow", items: [payload.id] },
        ]),
        unused,
      };
    }
    return {
      layout: layout.map((slot) => {
        if (slot.type !== "overflow") return slot;
        const items = [...slot.items];
        items.splice(Math.min(dest.index, items.length), 0, payload.id);
        return { type: "overflow", items };
      }),
      unused,
    };
  }
  const next = [...layout];
  next.splice(dest.index, 0, { type: "item", id: payload.id });
  return { layout: normalizeToolbarLayout(next), unused };
}

function adjustDest(
  source: ToolbarLocation,
  dest: ToolbarLocation
): ToolbarLocation {
  if (source.zone !== dest.zone) return dest;
  if (source.index < dest.index) {
    return { zone: dest.zone, index: dest.index - 1 };
  }
  return dest;
}

/** Move a toolbar chip, divider, or the Aa+ folder between zones. */
export function moveToolbarEntry(
  layout: ToolbarLayout,
  unused: ToolbarItemId[],
  source: ToolbarLocation,
  dest: ToolbarLocation
): { layout: ToolbarLayout; unused: ToolbarItemId[] } {
  if (source.zone === dest.zone && source.index === dest.index) {
    return { layout, unused };
  }
  const taken = takeFromZone(layout, unused, source);
  if (!taken.payload) return { layout, unused };
  return insertIntoZone(
    taken.layout,
    taken.unused,
    adjustDest(source, dest),
    taken.payload
  );
}

export function addToolbarDivider(
  layout: ToolbarLayout,
  index?: number
): ToolbarLayout {
  const divider: ToolbarDividerSlot = { type: "divider", id: newDividerId() };
  const next = [...layout];
  const at =
    index == null
      ? Math.max(1, next.length - 1)
      : Math.max(0, Math.min(index, next.length));
  next.splice(at, 0, divider);
  return normalizeToolbarLayout(next);
}

export function removeToolbarDivider(
  layout: ToolbarLayout,
  id: string
): ToolbarLayout {
  return normalizeToolbarLayout(
    layout.filter((slot) => !(slot.type === "divider" && slot.id === id))
  );
}
