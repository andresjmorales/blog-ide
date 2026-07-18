"use client";

import { PanelTabMenu } from "@/components/panels/PanelTabMenu";
import { PanelSlot } from "@/components/panels/PersistentPanel";
import {
  PANEL_LABELS,
  visibleTabs,
  type DockSide,
  type PanelId,
  type PanelLayout,
} from "@/lib/panels/layout";

type Props = {
  side: DockSide;
  layout: PanelLayout;
  registerSlot: (id: PanelId, el: HTMLElement | null) => void;
  unregisterSlot?: (id: PanelId, el: HTMLElement | null) => void;
  onSelectTab: (id: PanelId) => void;
  onMoveTo: (id: PanelId, side: DockSide) => void;
  onPopOut: (id: PanelId) => void;
  onClose: (id: PanelId) => void;
  onResizeStart?: () => void;
  className?: string;
  /** Bottom dock: fixed height; left/right use width from layout.sizes */
  style?: React.CSSProperties;
};

export function DockRegion({
  side,
  layout,
  registerSlot,
  unregisterSlot,
  onSelectTab,
  onMoveTo,
  onPopOut,
  onClose,
  onResizeStart,
  className = "",
  style,
}: Props) {
  const tabs = visibleTabs(layout, side);
  if (tabs.length === 0) return null;

  const active =
    (layout.active[side] && tabs.includes(layout.active[side]!)
      ? layout.active[side]
      : tabs[0]) ?? null;

  const isBottom = side === "bottom";

  return (
    <div
      className={`flex min-h-0 flex-col bg-panel/60 ${className}`}
      style={style}
    >
      {isBottom && onResizeStart && (
        <div
          role="separator"
          aria-orientation="horizontal"
          onPointerDown={onResizeStart}
          className="h-1 shrink-0 cursor-row-resize hover:bg-accent/40"
        />
      )}
      <div className="flex shrink-0 items-stretch border-b border-border text-sm">
        {tabs.map((id) => {
          const selected = id === active;
          return (
            <PanelTabMenu
              key={id}
              panelId={id}
              currentSide={side}
              selected={selected}
              onMoveTo={(to) => onMoveTo(id, to)}
              onPopOut={() => onPopOut(id)}
              onClose={() => onClose(id)}
            >
              <button
                type="button"
                onClick={() => onSelectTab(id)}
                className={`max-w-[9rem] truncate py-1.5 pl-3 pr-0.5 ${
                  selected ? "font-medium" : ""
                }`}
              >
                {PANEL_LABELS[id]}
              </button>
            </PanelTabMenu>
          );
        })}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {tabs.map((id) => (
          <PanelSlot
            key={id}
            panelId={id}
            register={registerSlot}
            unregister={unregisterSlot}
            hidden={id !== active}
            className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
          />
        ))}
      </div>
    </div>
  );
}
