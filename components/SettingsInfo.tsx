"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { InfoIcon } from "@/components/icons";

const TIP_WIDTH = 248;
const VIEW_PAD = 8;

type Props = {
  text: string;
};

/** Compact “i” control; longer setting copy lives in the hover/focus tip. */
export function SettingsInfo({ text }: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = Math.min(TIP_WIDTH, window.innerWidth - VIEW_PAD * 2);
    const left = Math.min(
      Math.max(VIEW_PAD, rect.left),
      window.innerWidth - width - VIEW_PAD
    );
    let top = rect.bottom + 6;
    const tipHeight = tipRef.current?.offsetHeight ?? 0;
    if (tipHeight && top + tipHeight > window.innerHeight - VIEW_PAD) {
      top = Math.max(VIEW_PAD, rect.top - tipHeight - 6);
    }
    setCoords({ top, left });
  }, [open, text]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        tipRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open]);

  return (
    <span className="settings-info">
      <button
        ref={buttonRef}
        type="button"
        className="settings-info-btn"
        aria-label="More information"
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <InfoIcon size={13} />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            ref={tipRef}
            id={tipId}
            role="tooltip"
            className="settings-info-tip"
            style={
              coords
                ? { top: coords.top, left: coords.left }
                : { visibility: "hidden" }
            }
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}

export function SettingsLabel({
  children,
  info,
}: {
  children: ReactNode;
  info?: string;
}) {
  return (
    <span className="settings-label">
      {children}
      {info ? <SettingsInfo text={info} /> : null}
    </span>
  );
}
