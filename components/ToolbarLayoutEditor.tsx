"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useEditorPrefs } from "@/components/EditorPrefsContext";
import { SettingsLabel } from "@/components/SettingsInfo";
import { FormattingAaIcon, GrabHandle } from "@/components/icons";
import {
  addToolbarDivider,
  DEFAULT_TOOLBAR_LAYOUT,
  layoutsEqual,
  moveToolbarEntry,
  normalizeToolbarLayout,
  overflowSlot,
  parseToolbarDropKey,
  preferToolbarDropKey,
  removeToolbarDivider,
  toolbarSourceKey,
  TOOLBAR_ITEM_LABELS,
  unusedToolbarItems,
  type ToolbarDropKey,
  type ToolbarItemId,
  type ToolbarLayout,
  type ToolbarLocation,
  type ToolbarSlot,
} from "@/lib/editor/toolbarLayout";

type DragState = {
  source: ToolbarLocation;
  started: boolean;
  x: number;
  y: number;
};

export function ToolbarLayoutEditor() {
  const { prefs, updatePrefs } = useEditorPrefs();
  const [draft, setDraft] = useState<ToolbarLayout>(() =>
    normalizeToolbarLayout(prefs.toolbarLayout)
  );
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const unused = unusedToolbarItems(draft);
  const overflow = overflowSlot(draft);
  const dirty = !layoutsEqual(draft, prefs.toolbarLayout);
  const lengths = {
    bar: draft.length,
    overflow: overflow?.items.length ?? 0,
    unused: unused.length,
  };
  const stopListenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => stopListenRef.current?.();
  }, []);

  function applyMove(source: ToolbarLocation, dest: ToolbarLocation) {
    const next = moveToolbarEntry(draft, unused, source, dest);
    setDraft(next.layout);
  }

  function dropAt(key: string | undefined, source: ToolbarLocation) {
    const dest = parseToolbarDropKey(key, lengths);
    if (!dest) return;
    applyMove(source, dest);
  }

  function dropKeyAt(clientX: number, clientY: number, source: ToolbarLocation) {
    const sourceKey = toolbarSourceKey(source);
    const stack =
      typeof document.elementsFromPoint === "function"
        ? document.elementsFromPoint(clientX, clientY)
        : [document.elementFromPoint(clientX, clientY)];
    const keys: string[] = [];
    for (const node of stack) {
      if (!(node instanceof Element)) continue;
      const hit = node.closest<HTMLElement>("[data-toolbar-drop]");
      const key = hit?.getAttribute("data-toolbar-drop");
      if (key && !keys.includes(key)) keys.push(key);
    }
    const preferred = preferToolbarDropKey(keys, sourceKey);
    if (preferred && !preferred.endsWith(":end")) return preferred;
    if (preferred?.endsWith(":end")) {
      const zone = preferred.split(":")[0];
      const strip = document.querySelector<HTMLElement>(
        `[data-toolbar-drop="${preferred}"]`
      );
      if (strip && zone) {
        const fromX = dropKeyFromStripX(strip, zone, clientX, sourceKey);
        if (fromX) return fromX;
      }
    }
    return preferred;
  }

  function onChipPointerDown(
    event: PointerEvent<HTMLElement>,
    source: ToolbarLocation,
    onClick?: () => void
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* happy-dom and some browsers omit capture */
    }
    const pointerId = event.pointerId;
    const next = { source, started: false, x: event.clientX, y: event.clientY };
    dragRef.current = next;
    setDrag(next);
    setDragOver(null);

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const cur = dragRef.current;
      if (!cur) return;
      const dist = Math.hypot(moveEvent.clientX - cur.x, moveEvent.clientY - cur.y);
      const started = cur.started || dist >= 4;
      if (started !== cur.started) {
        const startedDrag = { ...cur, started };
        dragRef.current = startedDrag;
        setDrag(startedDrag);
      }
      if (!started) return;
      setDragOver(dropKeyAt(moveEvent.clientX, moveEvent.clientY, cur.source) ?? null);
    };

    const onUp = (upEvent: globalThis.PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      stopListen();
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      setDragOver(null);
      if (!cur) return;
      if (!cur.started) {
        onClick?.();
        return;
      }
      dropAt(dropKeyAt(upEvent.clientX, upEvent.clientY, cur.source), cur.source);
    };

    function stopListen() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      stopListenRef.current = null;
    }

    stopListenRef.current?.();
    stopListenRef.current = stopListen;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  return (
    <div className="toolbar-layout-editor">
      <div className="settings-row settings-row-stack">
        <SettingsLabel info="Drag chips to reorder the essay toolbar. Aa+ is an overflow folder. Dividers become the vertical bars. Save writes the layout; Cancel discards the draft.">
          Rearrange toolbar
        </SettingsLabel>
        <p className="settings-help">
          Drag items, drop them on Aa+ to hide them in the overflow menu, or
          park unused controls in Available.
        </p>
      </div>

      <div className="toolbar-layout-zone">
        <div className="toolbar-layout-zone-label">Toolbar</div>
        <div
          className={`toolbar-layout-strip${
            dragOver === "bar:end" ? " is-drop" : ""
          }`}
          data-toolbar-drop="bar:end"
        >
          {draft.map((slot, index) => (
            <BarChip
              key={slotKey(slot, index)}
              slot={slot}
              index={index}
              highlight={dragOver === `bar:${index}`}
              dragging={
                drag?.started &&
                drag.source.zone === "bar" &&
                drag.source.index === index
              }
              onPointerDown={(event) =>
                onChipPointerDown(
                  event,
                  { zone: "bar", index },
                  slot.type === "divider"
                    ? () => setDraft(removeToolbarDivider(draft, slot.id))
                    : undefined
                )
              }
            />
          ))}
        </div>
      </div>

      <div className="toolbar-layout-zone">
        <div className="toolbar-layout-zone-label">
          <FormattingAaIcon /> overflow
        </div>
        <div
          className={`toolbar-layout-strip${
            dragOver === "overflow:end" ? " is-drop" : ""
          }`}
          data-toolbar-drop="overflow:end"
        >
          {(overflow?.items ?? []).length === 0 ? (
            <span className="toolbar-layout-empty">Drop items here</span>
          ) : (
            overflow?.items.map((id, index) => (
              <ItemChip
                key={id}
                id={id}
                dropKey={`overflow:${index}`}
                highlight={dragOver === `overflow:${index}`}
                dragging={
                  drag?.started &&
                  drag.source.zone === "overflow" &&
                  drag.source.index === index
                }
                onPointerDown={(event) =>
                  onChipPointerDown(event, { zone: "overflow", index })
                }
              />
            ))
          )}
        </div>
      </div>

      <div className="toolbar-layout-zone">
        <div className="toolbar-layout-zone-label">Available</div>
        <div
          className={`toolbar-layout-strip${
            dragOver === "unused:end" ? " is-drop" : ""
          }`}
          data-toolbar-drop="unused:end"
        >
          {unused.length === 0 ? (
            <span className="toolbar-layout-empty">Every control is in use</span>
          ) : (
            unused.map((id, index) => (
              <ItemChip
                key={id}
                id={id}
                dropKey={`unused:${index}`}
                highlight={dragOver === `unused:${index}`}
                dragging={
                  drag?.started &&
                  drag.source.zone === "unused" &&
                  drag.source.index === index
                }
                onPointerDown={(event) =>
                  onChipPointerDown(event, { zone: "unused", index })
                }
              />
            ))
          )}
        </div>
      </div>

      <div className="toolbar-layout-actions">
        <button
          type="button"
          className="blogide-cleanup-action"
          onClick={() => setDraft(addToolbarDivider(draft))}
        >
          <span className="blogide-cleanup-action-label">Add divider</span>
        </button>
        <button
          type="button"
          className="settings-link-btn"
          onClick={() => setDraft(normalizeToolbarLayout(DEFAULT_TOOLBAR_LAYOUT))}
        >
          Reset to default
        </button>
        <span className="toolbar-layout-actions-spacer" />
        <button
          type="button"
          className="settings-link-btn"
          disabled={!dirty}
          onClick={() => setDraft(normalizeToolbarLayout(prefs.toolbarLayout))}
        >
          Cancel
        </button>
        <button
          type="button"
          className="blogide-cleanup-action"
          disabled={!dirty}
          onClick={() => updatePrefs({ toolbarLayout: draft })}
        >
          <span className="blogide-cleanup-action-label">Save</span>
        </button>
      </div>
    </div>
  );
}

function slotKey(slot: ToolbarSlot, index: number): string {
  if (slot.type === "item") return `item-${slot.id}`;
  if (slot.type === "divider") return `div-${slot.id}`;
  return `overflow-${index}`;
}

function dropKeyFromStripX(
  strip: HTMLElement,
  zone: string,
  clientX: number,
  sourceKey: string
): string {
  const chips = [...strip.querySelectorAll<HTMLElement>(":scope > [data-toolbar-drop]")];
  for (const chip of chips) {
    const key = chip.getAttribute("data-toolbar-drop");
    if (!key || key === sourceKey || key.endsWith(":end")) continue;
    const rect = chip.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (clientX < rect.left + rect.width / 2) return key;
  }
  return `${zone}:end`;
}

function BarChip({
  slot,
  index,
  highlight,
  dragging,
  onPointerDown,
}: {
  slot: ToolbarSlot;
  index: number;
  highlight: boolean;
  dragging: boolean;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
}) {
  if (slot.type === "divider") {
    return (
      <button
        type="button"
        data-toolbar-drop={`bar:${index}`}
        title="Divider — drag to move, click to remove"
        aria-label={`Divider ${index + 1}`}
        className={`toolbar-layout-chip is-divider${highlight ? " is-drop" : ""}${
          dragging ? " is-dragging" : ""
        }`}
        onPointerDown={onPointerDown}
      >
        <GrabHandle className="toolbar-layout-grip" />
        <span className="toolbar-layout-divider-bar" />
      </button>
    );
  }
  if (slot.type === "overflow") {
    return (
      <div
        data-toolbar-drop={`bar:${index}`}
        title="Aa+ overflow folder"
        className={`toolbar-layout-chip is-overflow${highlight ? " is-drop" : ""}${
          dragging ? " is-dragging" : ""
        }`}
        onPointerDown={onPointerDown}
      >
        <GrabHandle className="toolbar-layout-grip" />
        <FormattingAaIcon />
        <span>{slot.items.length}</span>
      </div>
    );
  }
  return (
    <ItemChip
      id={slot.id}
      dropKey={`bar:${index}`}
      highlight={highlight}
      dragging={dragging}
      onPointerDown={onPointerDown}
    />
  );
}

function ItemChip({
  id,
  dropKey,
  highlight,
  dragging,
  onPointerDown,
}: {
  id: ToolbarItemId;
  dropKey: ToolbarDropKey;
  highlight: boolean;
  dragging: boolean;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
}) {
  return (
    <div
      data-toolbar-drop={dropKey}
      title={TOOLBAR_ITEM_LABELS[id]}
      className={`toolbar-layout-chip${highlight ? " is-drop" : ""}${
        dragging ? " is-dragging" : ""
      }`}
      onPointerDown={onPointerDown}
    >
      <GrabHandle className="toolbar-layout-grip" />
      <span>{TOOLBAR_ITEM_LABELS[id]}</span>
    </div>
  );
}
