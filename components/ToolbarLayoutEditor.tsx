"use client";

import { useState, type DragEvent } from "react";
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
  removeToolbarDivider,
  TOOLBAR_ITEM_LABELS,
  unusedToolbarItems,
  type ToolbarItemId,
  type ToolbarLayout,
  type ToolbarLocation,
  type ToolbarSlot,
} from "@/lib/editor/toolbarLayout";

type DragPayload = ToolbarLocation & { kind: "item" | "divider" | "overflow" };

function parseDrag(data: string | undefined): DragPayload | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as DragPayload;
    if (
      parsed &&
      (parsed.zone === "bar" ||
        parsed.zone === "overflow" ||
        parsed.zone === "unused") &&
      typeof parsed.index === "number"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function ToolbarLayoutEditor() {
  const { prefs, updatePrefs } = useEditorPrefs();
  const [draft, setDraft] = useState<ToolbarLayout>(() =>
    normalizeToolbarLayout(prefs.toolbarLayout)
  );
  const [dragOver, setDragOver] = useState<string | null>(null);

  const unused = unusedToolbarItems(draft);
  const overflow = overflowSlot(draft);
  const dirty = !layoutsEqual(draft, prefs.toolbarLayout);

  function applyMove(source: ToolbarLocation, dest: ToolbarLocation) {
    const next = moveToolbarEntry(draft, unused, source, dest);
    setDraft(next.layout);
  }

  function onDragStart(event: DragEvent, payload: DragPayload) {
    event.dataTransfer.setData("application/json", JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(event: DragEvent, key: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOver(key);
  }

  function onDrop(event: DragEvent, dest: ToolbarLocation) {
    event.preventDefault();
    setDragOver(null);
    const source = parseDrag(event.dataTransfer.getData("application/json"));
    if (!source) return;
    applyMove(source, dest);
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
          className="toolbar-layout-strip"
          onDragOver={(event) => onDragOver(event, "bar-end")}
          onDrop={(event) => onDrop(event, { zone: "bar", index: draft.length })}
          onDragLeave={() => setDragOver(null)}
        >
          {draft.map((slot, index) => (
            <BarChip
              key={slotKey(slot, index)}
              slot={slot}
              index={index}
              highlight={dragOver === `bar-${index}`}
              onDragStart={(event) =>
                onDragStart(event, {
                  zone: "bar",
                  index,
                  kind: slot.type,
                })
              }
              onDragOver={(event) => onDragOver(event, `bar-${index}`)}
              onDrop={(event) => onDrop(event, { zone: "bar", index })}
              onRemoveDivider={
                slot.type === "divider"
                  ? () => setDraft(removeToolbarDivider(draft, slot.id))
                  : undefined
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
            dragOver === "overflow-end" ? " is-drop" : ""
          }`}
          onDragOver={(event) => onDragOver(event, "overflow-end")}
          onDrop={(event) =>
            onDrop(event, {
              zone: "overflow",
              index: overflow?.items.length ?? 0,
            })
          }
          onDragLeave={() => setDragOver(null)}
        >
          {(overflow?.items ?? []).length === 0 ? (
            <span className="toolbar-layout-empty">Drop items here</span>
          ) : (
            overflow?.items.map((id, index) => (
              <ItemChip
                key={id}
                id={id}
                highlight={dragOver === `overflow-${index}`}
                onDragStart={(event) =>
                  onDragStart(event, {
                    zone: "overflow",
                    index,
                    kind: "item",
                  })
                }
                onDragOver={(event) => onDragOver(event, `overflow-${index}`)}
                onDrop={(event) => onDrop(event, { zone: "overflow", index })}
              />
            ))
          )}
        </div>
      </div>

      <div className="toolbar-layout-zone">
        <div className="toolbar-layout-zone-label">Available</div>
        <div
          className={`toolbar-layout-strip${
            dragOver === "unused-end" ? " is-drop" : ""
          }`}
          onDragOver={(event) => onDragOver(event, "unused-end")}
          onDrop={(event) =>
            onDrop(event, { zone: "unused", index: unused.length })
          }
          onDragLeave={() => setDragOver(null)}
        >
          {unused.length === 0 ? (
            <span className="toolbar-layout-empty">Every control is in use</span>
          ) : (
            unused.map((id, index) => (
              <ItemChip
                key={id}
                id={id}
                highlight={dragOver === `unused-${index}`}
                onDragStart={(event) =>
                  onDragStart(event, { zone: "unused", index, kind: "item" })
                }
                onDragOver={(event) => onDragOver(event, `unused-${index}`)}
                onDrop={(event) => onDrop(event, { zone: "unused", index })}
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

function BarChip({
  slot,
  index,
  highlight,
  onDragStart,
  onDragOver,
  onDrop,
  onRemoveDivider,
}: {
  slot: ToolbarSlot;
  index: number;
  highlight: boolean;
  onDragStart: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onRemoveDivider?: () => void;
}) {
  if (slot.type === "divider") {
    return (
      <button
        type="button"
        draggable
        title="Divider — drag to move, click to remove"
        aria-label={`Divider ${index + 1}`}
        className={`toolbar-layout-chip is-divider${highlight ? " is-drop" : ""}`}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={onRemoveDivider}
      >
        <GrabHandle className="toolbar-layout-grip" />
        <span className="toolbar-layout-divider-bar" />
      </button>
    );
  }
  if (slot.type === "overflow") {
    return (
      <div
        draggable
        title="Aa+ overflow folder"
        className={`toolbar-layout-chip is-overflow${highlight ? " is-drop" : ""}`}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
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
      highlight={highlight}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    />
  );
}

function ItemChip({
  id,
  highlight,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  id: ToolbarItemId;
  highlight: boolean;
  onDragStart: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}) {
  return (
    <div
      draggable
      title={TOOLBAR_ITEM_LABELS[id]}
      className={`toolbar-layout-chip${highlight ? " is-drop" : ""}`}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <GrabHandle className="toolbar-layout-grip" />
      <span>{TOOLBAR_ITEM_LABELS[id]}</span>
    </div>
  );
}
