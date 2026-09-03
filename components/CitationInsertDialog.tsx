"use client";

import type { Editor } from "@tiptap/core";
import { CiteRail } from "@/components/CiteRail";

type Props = {
  editor: Editor;
  open: boolean;
  onClose: () => void;
};

/** Narrow-viewport Cite sheet. Desktop uses the Cite rail instead. */
export function CitationInsertDialog({ editor, open, onClose }: Props) {
  return (
    <CiteRail
      editor={editor}
      open={open}
      onToggle={onClose}
      variant="sheet"
    />
  );
}
