"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { openLinkEditor } from "@/lib/editor/linkShortcut";
import { FootnoteToolbar } from "@/components/FootnoteToolbar";
import {
  clearFindHighlights,
  scrollMatchIntoView,
  setFindHighlights,
} from "@/lib/editor/findHighlight";
import { findInEditor } from "@/lib/editor/findReplaceInEditor";
import { applyEditorDomLang } from "@/lib/editor/domAttrs";
import type { FootnoteFindSession } from "@/lib/editor/footnoteFindBridge";
import {
  applyFootnoteHistoryKey,
  footnoteHistoryAction,
  isFootnoteHistoryTarget,
} from "@/lib/editor/footnoteHistoryKeys";
import { createFootnoteExtensions } from "@/lib/editor/footnoteSchema";
import { firstImageFile } from "@/lib/editor/insertEssayImage";
import {
  footnoteAttrSyncDelay,
  shouldApplyExternalFootnoteContent,
  shouldCommitFootnoteAttrs,
} from "@/lib/editor/footnoteCard";

type Props = {
  content: string;
  number: number;
  footnoteId: string;
  typography: boolean;
  spellLang: string;
  updateAttributes: (attrs: { content: string }) => void;
  isFindTarget: boolean;
  findSession: FootnoteFindSession | null;
  pendingFocusRef: MutableRefObject<boolean>;
  commitRef: MutableRefObject<(() => void) | null>;
  dragSuppressUntilRef: MutableRefObject<number>;
};

/**
 * Nested TipTap instance for one open footnote card.
 * Closed marks must not keep an editor alive (36 notes × schema is typing cost).
 */
export function FootnoteNoteEditor({
  content,
  number,
  footnoteId,
  typography,
  spellLang,
  updateAttributes,
  isFindTarget,
  findSession,
  pendingFocusRef,
  commitRef,
  dragSuppressUntilRef,
}: Props) {
  const noteEditor = useEditor(
    {
      extensions: createFootnoteExtensions({ typography }),
      content,
      contentType: "markdown",
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: "footnote-card-editor outline-none",
          "aria-label": `Footnote ${number} content`,
          spellcheck: "false",
          lang: spellLang,
        },
        handlePaste: (_view, event) => {
          if (firstImageFile(event.clipboardData?.files)) {
            event.preventDefault();
            return true;
          }
          return false;
        },
        handleDrop: (_view, event) => {
          if (firstImageFile(event.dataTransfer?.files)) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      },
    },
    [typography]
  );

  const contentRef = useRef(content);
  const attrSyncTimer = useRef(0);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    if (!noteEditor) return;
    applyEditorDomLang(noteEditor.view.dom as HTMLElement, spellLang);
  }, [noteEditor, spellLang]);

  useEffect(() => {
    if (!noteEditor) return;
    if (pendingFocusRef.current) {
      pendingFocusRef.current = false;
      dragSuppressUntilRef.current = performance.now() + 280;
      requestAnimationFrame(() => {
        noteEditor.commands.focus("end");
      });
    }
  }, [noteEditor, pendingFocusRef, dragSuppressUntilRef]);

  useEffect(() => {
    if (!noteEditor) return;
    if (!isFindTarget || !findSession) {
      clearFindHighlights(noteEditor);
      return;
    }
    const editor: Editor = noteEditor;
    const session = findSession;

    function applyNoteHighlights(scroll: boolean) {
      let matches;
      try {
        matches = findInEditor(
          editor,
          {
            query: session.query,
            regex: session.regex,
            caseSensitive: session.caseSensitive,
          },
          "document"
        );
      } catch {
        clearFindHighlights(editor);
        return;
      }
      if (matches.length === 0) {
        clearFindHighlights(editor);
        return;
      }
      const activeIndex = Math.min(session.occurrence, matches.length - 1);
      setFindHighlights(editor, matches, activeIndex);
      const active = matches[activeIndex];
      if (scroll && active) {
        requestAnimationFrame(() => {
          scrollMatchIntoView(editor, active);
        });
      }
    }

    applyNoteHighlights(true);
    function onNoteUpdate({
      transaction,
    }: {
      transaction?: { docChanged?: boolean };
    }) {
      if (transaction && !transaction.docChanged) {
        return;
      }
      applyNoteHighlights(false);
    }
    editor.on("update", onNoteUpdate);
    return () => {
      editor.off("update", onNoteUpdate);
    };
  }, [noteEditor, isFindTarget, findSession]);

  useEffect(() => {
    if (!noteEditor) return;
    const current = noteEditor;
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!anchor || !current.view.dom.contains(anchor)) return;
      const href = (anchor as HTMLAnchorElement).getAttribute("href") || "";
      event.preventDefault();
      window.requestAnimationFrame(() => {
        openLinkEditor(current, { allowPreview: true, href });
      });
    }
    const dom = current.view.dom;
    dom.addEventListener("click", onClick);
    return () => dom.removeEventListener("click", onClick);
  }, [noteEditor]);

  useEffect(() => {
    if (!noteEditor) return;
    if (
      !shouldApplyExternalFootnoteContent({
        incoming: content,
        editorMarkdown: noteEditor.getMarkdown(),
        isFocused: noteEditor.isFocused,
      })
    ) {
      return;
    }
    noteEditor
      .chain()
      .command(({ tr }) => {
        tr.setMeta("addToHistory", false);
        return true;
      })
      .setContent(content, {
        contentType: "markdown",
        emitUpdate: false,
      })
      .run();
  }, [content, noteEditor]);

  const commitContent = useCallback(() => {
    if (!noteEditor) return;
    const next = noteEditor.getMarkdown().trim();
    if (next !== contentRef.current) {
      updateAttributes({ content: next });
    }
  }, [noteEditor, updateAttributes]);

  useEffect(() => {
    commitRef.current = commitContent;
    return () => {
      commitRef.current = null;
    };
  }, [commitContent, commitRef]);

  useEffect(() => {
    if (!noteEditor) return;
    const sync = () => {
      const snapshot = noteEditor.getMarkdown().trim();
      if (snapshot === contentRef.current) return;
      if (attrSyncTimer.current) window.clearTimeout(attrSyncTimer.current);
      const delay = footnoteAttrSyncDelay(noteEditor.isFocused, snapshot);
      const commit = () => {
        attrSyncTimer.current = 0;
        const latest = noteEditor.getMarkdown().trim();
        if (
          !shouldCommitFootnoteAttrs({
            next: latest,
            current: contentRef.current,
            isFocused: noteEditor.isFocused,
          })
        ) {
          return;
        }
        updateAttributes({ content: latest });
      };
      if (delay === 0) {
        commit();
        return;
      }
      attrSyncTimer.current = window.setTimeout(commit, delay);
    };
    noteEditor.on("update", sync);
    return () => {
      noteEditor.off("update", sync);
      if (attrSyncTimer.current) window.clearTimeout(attrSyncTimer.current);
      const latest = noteEditor.getMarkdown().trim();
      if (
        shouldCommitFootnoteAttrs({
          next: latest,
          current: contentRef.current,
          isFocused: false,
        })
      ) {
        updateAttributes({ content: latest });
      }
    };
  }, [noteEditor, updateAttributes]);

  useEffect(() => {
    if (!noteEditor) return;
    const historyEditor = noteEditor;
    function onKeyDown(event: KeyboardEvent) {
      const action = footnoteHistoryAction(event);
      if (!action) return;
      if (!isFootnoteHistoryTarget(event.target, footnoteId)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      applyFootnoteHistoryKey(historyEditor, action);
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [noteEditor, footnoteId]);

  if (!noteEditor) return null;

  return (
    <>
      <FootnoteToolbar editor={noteEditor} />
      <EditorContent
        editor={noteEditor}
        className="footnote-card-editor-shell"
      />
    </>
  );
}
