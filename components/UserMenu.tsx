"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getTheme, setTheme, type ThemeMode } from "@/lib/theme";

type Props = {
  displayName: string;
  email: string;
  previewMode?: boolean;
  onAccountSettings: () => void;
  onHelp: () => void;
  onSignOut: () => void;
};

function initialsFromName(name: string, email: string): string {
  const source = name.trim() || email.trim();
  if (!source) return "?";
  const parts = source.split(/[\s._@-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function UserMenu({
  displayName,
  email,
  previewMode = false,
  onAccountSettings,
  onHelp,
  onSignOut,
}: Props) {
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState<ThemeMode>(() =>
    typeof document !== "undefined" ? getTheme() : "light"
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initials = initialsFromName(displayName, email);
  const label = displayName.trim() || email || "Account";

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open]);

  return (
    <div className="user-menu relative" ref={rootRef}>
      <button
        type="button"
        className="user-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={label}
        onClick={() => {
          setThemeState(getTheme());
          setOpen((v) => !v);
        }}
      >
        <span aria-hidden>{initials}</span>
        <span className="sr-only">Account menu</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="user-menu-panel absolute right-0 top-full z-50 mt-1.5 min-w-[14rem] rounded-md border border-border bg-background py-1 text-sm shadow-md"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="font-medium text-foreground truncate">{label}</p>
            {email && email !== label && (
              <p className="truncate text-xs text-muted">{email}</p>
            )}
            {previewMode && (
              <p className="mt-0.5 text-xs text-muted">Preview mode</p>
            )}
          </div>

          <button
            type="button"
            role="menuitem"
            className="user-menu-item"
            onClick={() => {
              setOpen(false);
              onAccountSettings();
            }}
          >
            Account settings
          </button>

          <label className="user-menu-item user-menu-toggle">
            <span>Dark mode</span>
            <input
              type="checkbox"
              checked={theme === "dark"}
              onChange={(e) => {
                const next: ThemeMode = e.target.checked ? "dark" : "light";
                setTheme(next);
                setThemeState(next);
              }}
            />
          </label>

          <button
            type="button"
            role="menuitem"
            className="user-menu-item"
            onClick={() => {
              setOpen(false);
              onHelp();
            }}
          >
            Help
          </button>

          {!previewMode && (
            <>
              <div className="my-1 border-t border-border" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="user-menu-item"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
