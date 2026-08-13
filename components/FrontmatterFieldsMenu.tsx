"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InfoIcon } from "@/components/icons";
import { claimFloatZ } from "@/lib/pins/pinStore";
import {
  extraFrontmatterFields,
  isReservedFrontmatterKey,
  isValidFrontmatterKey,
  removeFrontmatterField,
  TEMPLATE_FRONTMATTER_LABELS,
  writeFrontmatterField,
  type TemplateFrontmatterKey,
} from "@/lib/markdown/yamlFields";

const PANEL_WIDTH = 320;
const PANEL_MAX_HEIGHT = 440;
const VIEWPORT_PAD = 12;

type Props = {
  frontmatter: string;
  onFrontmatterChange: (next: string) => void;
};

type PanelPos = { top: number; left: number; maxHeight: number };

function FieldInput({
  id,
  label,
  value,
  placeholder,
  onCommit,
  onRemove,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (next: string) => void;
  onRemove?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    setFocused(false);
    if (draft !== value) onCommit(draft);
  }

  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-[0.68rem] font-medium uppercase tracking-wider text-muted">
        {label}
        {onRemove ? (
          <button
            type="button"
            className="normal-case tracking-normal text-muted hover:text-foreground"
            onClick={onRemove}
            aria-label={`Remove ${label}`}
          >
            Remove
          </button>
        ) : null}
      </span>
      <input
        id={id}
        type="text"
        value={focused ? draft : value}
        placeholder={placeholder}
        onFocus={() => {
          setFocused(true);
          setDraft(value);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
        className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}

export function FrontmatterFieldsMenu({
  frontmatter,
  onFrontmatterChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const [panelZ, setPanelZ] = useState(80);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const { template, custom } = extraFrontmatterFields(frontmatter);

  function closeMenu() {
    setOpen(false);
    setPos(null);
    setAddError(null);
  }

  function openMenu() {
    setPanelZ(claimFloatZ());
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_PAD * 2);
      setPos({
        top: rect.bottom + 4,
        left: Math.max(VIEWPORT_PAD, rect.right - width),
        maxHeight: PANEL_MAX_HEIGHT,
      });
    }
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open) return;

    function place() {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_PAD * 2);
      let left = rect.right - width;
      left = Math.max(
        VIEWPORT_PAD,
        Math.min(left, window.innerWidth - VIEWPORT_PAD - width)
      );

      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD;
      const spaceAbove = rect.top - VIEWPORT_PAD;
      const preferBelow =
        spaceBelow >= Math.min(220, PANEL_MAX_HEIGHT) ||
        spaceBelow >= spaceAbove;
      const available = Math.max(0, preferBelow ? spaceBelow : spaceAbove);
      const maxHeight = Math.min(PANEL_MAX_HEIGHT, Math.max(140, available - 4));
      const panelHeight = Math.min(
        panelRef.current?.offsetHeight ?? maxHeight,
        maxHeight
      );
      let top = preferBelow ? rect.bottom + 4 : rect.top - panelHeight - 4;
      top = Math.min(
        Math.max(VIEWPORT_PAD, top),
        window.innerHeight - VIEWPORT_PAD - Math.min(panelHeight, maxHeight)
      );

      setPos((prev) => {
        if (
          prev &&
          prev.top === top &&
          prev.left === left &&
          prev.maxHeight === maxHeight
        ) {
          return prev;
        }
        return { top, left, maxHeight };
      });
    }

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      place();
      raf2 = requestAnimationFrame(place);
    });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      // Ω panel inserts into focused frontmatter fields; keep this menu open.
      if (target.closest(".special-chars-panel, .special-chars")) return;
      closeMenu();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMenu();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  function commitField(key: string, value: string) {
    const next = writeFrontmatterField(frontmatter, key, value, {
      keepEmpty: true,
    });
    if (next !== frontmatter) onFrontmatterChange(next);
  }

  function removeField(key: string) {
    const next = removeFrontmatterField(frontmatter, key);
    if (next !== frontmatter) onFrontmatterChange(next);
  }

  function addCustomField() {
    const key = newKey.trim();
    if (!isValidFrontmatterKey(key)) {
      setAddError("Use letters, numbers, _ or - (start with a letter).");
      return;
    }
    if (isReservedFrontmatterKey(key)) {
      setAddError("Title, subtitle, and spellcheck are edited elsewhere.");
      return;
    }
    const next = writeFrontmatterField(frontmatter, key, newValue, {
      keepEmpty: true,
      create: true,
    });
    onFrontmatterChange(next);
    setNewKey("");
    setNewValue("");
    setAddError(null);
  }

  const panel =
    open &&
    pos &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Essay metadata"
        className="frontmatter-fields-panel fixed flex flex-col overflow-hidden rounded-lg border border-border bg-background p-3 shadow-lg"
        style={{
          top: pos.top,
          left: pos.left,
          width: Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_PAD * 2),
          maxHeight: pos.maxHeight,
          zIndex: panelZ,
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="mb-2 shrink-0 text-[0.68rem] uppercase tracking-wider text-muted">
          Frontmatter
        </p>
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pr-1 pb-1">
          {template.map((field) => (
            <FieldInput
              key={field.key}
              id={`fm-${field.key}`}
              label={
                TEMPLATE_FRONTMATTER_LABELS[
                  field.key as TemplateFrontmatterKey
                ]
              }
              value={field.value}
              placeholder={
                field.key === "date"
                  ? "YYYY-MM-DD"
                  : field.key === "status"
                    ? "draft"
                    : "Optional"
              }
              onCommit={(next) => commitField(field.key, next)}
            />
          ))}
          {custom.length > 0 ? (
            <div className="space-y-2.5 border-t border-border pt-2.5">
              {custom.map((field) => (
                <FieldInput
                  key={field.key}
                  id={`fm-custom-${field.key}`}
                  label={field.key}
                  value={field.value}
                  onCommit={(next) => commitField(field.key, next)}
                  onRemove={() => removeField(field.key)}
                />
              ))}
            </div>
          ) : null}
          <div className="space-y-1.5 border-t border-border pt-2.5">
            <p className="text-[0.68rem] font-medium uppercase tracking-wider text-muted">
              Add field
            </p>
            <div className="flex gap-1">
              <input
                type="text"
                value={newKey}
                onChange={(event) => {
                  setNewKey(event.target.value);
                  setAddError(null);
                }}
                placeholder="key"
                aria-label="New frontmatter key"
                className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 font-mono text-sm outline-none focus:border-accent"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomField();
                  }
                }}
              />
              <input
                type="text"
                value={newValue}
                onChange={(event) => setNewValue(event.target.value)}
                placeholder="value"
                aria-label="New frontmatter value"
                className="min-w-0 flex-[1.4] rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-accent"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomField();
                  }
                }}
              />
              <button
                type="button"
                onClick={addCustomField}
                className="rounded border border-border bg-panel px-2 py-1 text-sm hover:border-accent hover:text-accent"
              >
                Add
              </button>
            </div>
            {addError ? (
              <p className="text-xs text-red-600 dark:text-red-400">{addError}</p>
            ) : null}
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <div className="essay-frontmatter-menu">
      <button
        ref={buttonRef}
        type="button"
        title="Essay metadata (author, date, tags, custom fields)"
        aria-label="Essay metadata"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) closeMenu();
          else openMenu();
        }}
        className={`inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-panel hover:text-foreground ${
          open ? "bg-accent/15 text-accent" : ""
        }`}
      >
        <InfoIcon size={15} />
      </button>
      {panel}
    </div>
  );
}
