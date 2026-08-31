"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import "@gracious.tech/fetch-client/client.css";
import { fetchBiblePassage } from "@/lib/bible/client";
import {
  prepareBibleQuoteHtml,
  wrapBibleQuoteAsBlockquote,
} from "@/lib/bible/quoteHtml";
import {
  FETCH_BIBLE_TRANSLATION_ABBREV,
  FETCH_BIBLE_TRANSLATION_NAME,
} from "@/lib/bible/constants";
import { getBibleRefState } from "@/lib/editor/bible/BibleRefHighlight";
import type { BibleRefHit } from "@/lib/bible/hits";
import { claimFloatZ, openBiblePin } from "@/lib/pins/pinStore";

type Props = {
  editor: Editor | null;
};

type CardModel = {
  hit: BibleRefHit;
  left: number;
  top: number;
  zIndex: number;
};

function sameCard(a: CardModel | null, b: CardModel | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.hit.id === b.hit.id &&
    a.left === b.left &&
    a.top === b.top &&
    a.zIndex === b.zIndex
  );
}

export function BibleHoverCard({ editor }: Props) {
  const cacheRef = useRef<CardModel | null>(null);
  const [passage, setPassage] = useState<{
    id: string;
    html: string;
    text: string;
    error: string | null;
  } | null>(null);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!editor) return () => {};
      const sync = () => onStoreChange();
      editor.on("transaction", sync);
      window.addEventListener("resize", sync);
      return () => {
        editor.off("transaction", sync);
        window.removeEventListener("resize", sync);
      };
    },
    [editor]
  );

  const getSnapshot = useCallback((): CardModel | null => {
    if (!editor || editor.isDestroyed) {
      cacheRef.current = null;
      return null;
    }
    const state = getBibleRefState(editor);
    if (!state.activeId) {
      cacheRef.current = null;
      return null;
    }
    const hit = state.hits.find((item) => item.id === state.activeId);
    if (!hit) {
      cacheRef.current = null;
      return null;
    }
    let left = 8;
    let top = 8;
    try {
      const start = editor.view.coordsAtPos(hit.from);
      const end = editor.view.coordsAtPos(hit.to);
      left = Math.min(
        window.innerWidth - 360,
        Math.max(8, Math.min(start.left, end.left))
      );
      top = Math.max(start.bottom, end.bottom) + 6;
    } catch {
      // keep defaults
    }
    const prev = cacheRef.current;
    const zIndex =
      prev && prev.hit.id === hit.id ? prev.zIndex : claimFloatZ();
    const next: CardModel = { hit, left, top, zIndex };
    if (sameCard(prev, next)) return prev;
    cacheRef.current = next;
    return next;
  }, [editor]);

  const card = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const hitId = card?.hit.id ?? null;
  const serialized = card?.hit.serialized;

  useEffect(() => {
    if (!hitId || !serialized) return;
    let cancelled = false;
    void fetchBiblePassage(serialized)
      .then((result) => {
        if (cancelled) return;
        setPassage({
          id: hitId,
          html: result.html,
          text: result.text,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPassage({
          id: hitId,
          html: "",
          text: "",
          error: err instanceof Error ? err.message : "Could not load verse",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [hitId, serialized]);

  if (!card || !editor) return null;

  const loaded = passage?.id === card.hit.id ? passage : null;
  const hit = card.hit;
  const currentEditor = editor;

  function insertQuote() {
    const html = loaded?.html?.trim();
    const text = loaded?.text?.trim();
    if (!html && !text) return;
    const prepared = html ? prepareBibleQuoteHtml(html) : "";
    const inner =
      prepared ||
      `<p>${text ? text.replace(/&/g, "&amp;").replace(/</g, "&lt;") : ""}</p>`;
    currentEditor
      .chain()
      .focus()
      .insertContent(
        wrapBibleQuoteAsBlockquote(
          inner,
          `${hit.label} (${FETCH_BIBLE_TRANSLATION_ABBREV})`
        )
      )
      .run();
    currentEditor.commands.setBibleRefActive(null);
  }

  return createPortal(
    <div
      className="bible-ref-card"
      role="dialog"
      aria-label={`${card.hit.label} (${FETCH_BIBLE_TRANSLATION_NAME})`}
      style={{
        left: card.left,
        top: card.top,
        zIndex: card.zIndex,
      }}
      onMouseEnter={() => editor.commands.holdBibleRefCard()}
      onMouseLeave={() => editor.commands.releaseBibleRefCard()}
    >
      <p className="bible-ref-card-ref">
        {card.hit.label}
        <span> · {FETCH_BIBLE_TRANSLATION_ABBREV}</span>
      </p>
      {loaded?.error ? (
        <p className="bible-ref-card-status">{loaded.error}</p>
      ) : loaded?.html ? (
        <div
          className="bible-ref-card-passage fetch-bible no-chapters no-headings no-notes no-red-letter"
          dangerouslySetInnerHTML={{
            __html: prepareBibleQuoteHtml(loaded.html) || loaded.html,
          }}
        />
      ) : (
        <p className="bible-ref-card-status">Loading…</p>
      )}
      <div className="bible-ref-card-actions">
        <button
          type="button"
          onClick={() => {
            openBiblePin({ search: card.hit.search, title: card.hit.label });
          }}
        >
          Open Bible
        </button>
        <button
          type="button"
          disabled={!loaded?.text}
          onClick={insertQuote}
        >
          Insert quote
        </button>
        <button
          type="button"
          onClick={() => editor.commands.setBibleRefActive(null)}
        >
          Close
        </button>
      </div>
    </div>,
    document.body
  );
}
