"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { claimFloatZ } from "@/lib/pins/pinStore";
import { useAppDialog } from "@/components/AppDialog";
import { pickImageFile } from "@/lib/assets/imagePipeline";
import { insertEssayImageFromFile } from "@/lib/editor/insertEssayImage";
import { ImageIcon } from "@/components/icons";

/**
 * Toolbar image control: dropdown under the button (Upload / Use URL).
 */
export function ImageInsertMenu({ editor }: { editor: Editor }) {
  const dialog = useAppDialog();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const [zIndex, setZIndex] = useState(50);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left });
    setZIndex(claimFloatZ());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as globalThis.Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  async function finishInsert(src: string) {
    const alt =
      (await dialog.prompt({
        title: "Alt text",
        message: "Optional description for accessibility.",
        defaultValue: "",
        confirmLabel: "Insert",
      })) ?? "";
    editor.chain().focus().setImage({ src, alt }).run();
  }

  async function uploadImage() {
    setOpen(false);
    const file = await pickImageFile();
    if (!file) return;
    await insertEssayImageFromFile(editor, file, {
      promptAlt: async () =>
        dialog.prompt({
          title: "Alt text",
          message: "Optional description for accessibility.",
          defaultValue: "",
          confirmLabel: "Insert",
        }),
      alertQuota: async () => {
        await dialog.confirm({
          title: "Storage quota exceeded",
          message:
            "This image would exceed your combined markdown + Storage quota. Free space in Settings (Clean unused images) or remove large files from the Library.",
          confirmLabel: "OK",
          cancelLabel: "Close",
        });
      },
      alertError: async (message) => {
        await dialog.confirm({
          title: "Image failed",
          message,
          confirmLabel: "OK",
          cancelLabel: "Close",
        });
      },
    });
  }

  async function insertFromUrl() {
    setOpen(false);
    const src = await dialog.prompt({
      title: "Image URL",
      message: "Path or URL for the image.",
      defaultValue: "https://",
      confirmLabel: "Next",
    });
    if (!src) return;
    await finishInsert(src);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title="Insert image"
        aria-label="Insert image"
        aria-expanded={open}
        aria-haspopup="menu"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-8 min-w-8 items-center justify-center rounded px-2 text-[0.8125rem] leading-none ${
          open
            ? "bg-accent/15 text-accent"
            : "text-muted hover:bg-panel hover:text-foreground"
        }`}
      >
        <ImageIcon className="blogide-tool-icon" />
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Insert image"
            className="fixed min-w-[10rem] rounded-lg border border-border bg-background py-1 shadow-lg"
            style={{ top: coords.top, left: coords.left, zIndex }}
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-sm text-muted hover:bg-panel hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void uploadImage()}
            >
              Upload file…
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-sm text-muted hover:bg-panel hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void insertFromUrl()}
            >
              Use URL…
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
