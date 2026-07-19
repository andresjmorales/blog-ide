"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { FootnoteSidenote } from "@/components/FootnoteSidenote";
import { DeletedFootnotesPanel } from "@/components/DeletedFootnotesPanel";

type RailNote = {
  id: string;
  content: string;
  number: number;
};

/** Ease toward the other pane (lower = slower / smoother). */
const LINK_EASE = 0.22;

/**
 * Scrollable gutter of every footnote. When linked, essay ↔ rail scroll stay
 * in proportion (either pane can drive the other). When unlocked, the rail
 * is fully independent.
 */
export function SidenoteRail({
  editor,
  scrollRoot,
  onRootChange,
}: {
  editor: Editor;
  scrollRoot: HTMLElement | null;
  /** Expose the rail DOM for link hover previews (same as the main editor). */
  onRootChange?: (el: HTMLElement | null) => void;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onRootChange?.(asideRef.current);
    return () => onRootChange?.(null);
  }, [onRootChange]);
  const linkedRef = useRef(true);
  const [linked, setLinked] = useState(true);

  useEffect(() => {
    linkedRef.current = linked;
  }, [linked]);

  const notes = useEditorState({
    editor,
    selector: ({ editor: current }): RailNote[] => {
      const list: RailNote[] = [];
      let number = 0;
      current.state.doc.descendants((node) => {
        if (node.type.name !== "footnoteRef") return true;
        number += 1;
        list.push({
          id: String(node.attrs.id ?? ""),
          content: String(node.attrs.content ?? ""),
          number,
        });
        return true;
      });
      return list;
    },
  });

  useEffect(() => {
    const railPane = railRef.current;
    if (!scrollRoot || !railPane || !linked) return;
    const essayPane: HTMLElement = scrollRoot;
    const notesPane: HTMLElement = railPane;

    let frame = 0;
    let running = true;
    /** Which pane the user last moved — the other eases toward it. */
    let driver: "essay" | "rail" | null = null;
    let idleTimer = 0;

    function maxScroll(el: HTMLElement): number {
      return Math.max(0, el.scrollHeight - el.clientHeight);
    }

    function progressOf(el: HTMLElement): number {
      const max = maxScroll(el);
      return max <= 0 ? 0 : el.scrollTop / max;
    }

    function setProgress(el: HTMLElement, progress: number) {
      const max = maxScroll(el);
      el.scrollTop = Math.min(max, Math.max(0, progress * max));
    }

    function easeToward(el: HTMLElement, progress: number) {
      const max = maxScroll(el);
      const target = progress * max;
      const delta = target - el.scrollTop;
      if (Math.abs(delta) <= 0.5) {
        el.scrollTop = target;
        return false;
      }
      el.scrollTop += delta * LINK_EASE;
      return true;
    }

    function tick() {
      frame = 0;
      if (!running || !linkedRef.current || !driver) return;

      let needsMore = false;
      if (driver === "essay") {
        needsMore = easeToward(notesPane, progressOf(essayPane));
      } else {
        needsMore = easeToward(essayPane, progressOf(notesPane));
      }

      if (needsMore) {
        frame = window.requestAnimationFrame(tick);
      }
    }

    function scheduleTick() {
      if (!frame) frame = window.requestAnimationFrame(tick);
    }

    function markDriver(next: "essay" | "rail") {
      driver = next;
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        driver = null;
      }, 180);
      scheduleTick();
    }

    function onEssayScroll() {
      if (!linkedRef.current) return;
      // Ignore scroll we caused while easing from the rail.
      if (driver === "rail") return;
      markDriver("essay");
    }

    function onRailScroll() {
      if (!linkedRef.current) return;
      if (driver === "essay") return;
      markDriver("rail");
    }

    // Relink: snap rail to the essay immediately.
    setProgress(notesPane, progressOf(essayPane));

    function onResize() {
      if (!linkedRef.current) return;
      setProgress(notesPane, progressOf(essayPane));
    }

    essayPane.addEventListener("scroll", onEssayScroll, { passive: true });
    notesPane.addEventListener("scroll", onRailScroll, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      window.clearTimeout(idleTimer);
      if (frame) window.cancelAnimationFrame(frame);
      essayPane.removeEventListener("scroll", onEssayScroll);
      notesPane.removeEventListener("scroll", onRailScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [scrollRoot, linked]);

  function activate(id: string) {
    if (!scrollRoot || !id) return;
    const ref = scrollRoot.querySelector<HTMLElement>(
      `[data-footnote-id="${CSS.escape(id)}"] .footnote-ref`
    );
    if (!ref) return;
    ref.scrollIntoView({ behavior: "smooth", block: "center" });
    ref.click();
  }

  return (
    <aside
      ref={asideRef}
      className={`sidenote-rail ${linked ? "is-linked" : "is-unlocked"}`}
      aria-label="Footnotes"
    >
      <div className="sidenote-rail-toolbar">
        <span className="sidenote-rail-label">Notes</span>
        <button
          type="button"
          className="sidenote-rail-lock"
          aria-pressed={linked}
          title={
            linked
              ? "Unlock — scroll notes independently"
              : "Lock — scroll notes with the essay"
          }
          aria-label={
            linked
              ? "Unlock sidenote scrolling from the essay"
              : "Lock sidenote scrolling to the essay"
          }
          onClick={() => setLinked((value) => !value)}
        >
          {linked ? <LockIcon locked /> : <LockIcon locked={false} />}
          <span>{linked ? "Linked" : "Free"}</span>
        </button>
      </div>

      <div
        ref={railRef}
        className="sidenote-rail-scroll"
        onWheel={(event) => {
          // Keep the essay from also receiving this wheel; linked mode
          // moves the essay via the rail's scroll position instead.
          event.stopPropagation();
        }}
      >
        {notes.length === 0 ? (
          <p className="sidenote-rail-empty">
            Footnotes appear here as you add them.
          </p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id || `n-${note.number}`}
              data-rail-id={note.id}
              className="sidenote-rail-item"
            >
              <FootnoteSidenote
                number={note.number}
                markdown={note.content}
                onActivate={() => activate(note.id)}
              />
            </div>
          ))
        )}
      </div>

      <DeletedFootnotesPanel variant="rail" defaultOpen={false} />
    </aside>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  if (locked) {
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
      >
        <rect
          x="3"
          y="7"
          width="10"
          height="7"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M5 7V5a3 3 0 0 1 6 0v2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="3"
        y="7"
        width="10"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5 7V5a3 3 0 0 1 5.2-1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
