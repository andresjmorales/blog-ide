"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { FootnoteSidenote } from "@/components/FootnoteSidenote";
import { DeletedFootnotesPanel } from "@/components/DeletedFootnotesPanel";
import { PanelCaret } from "@/components/icons";
import { openFootnoteCardNear } from "@/lib/editor/footnoteOpen";
import {
  collectRailNotes,
  footnoteIndexKey,
  railNotesEqual,
} from "@/lib/editor/footnoteNumbers";
import {
  buildScrollMap,
  essayForRail,
  railForEssay,
  type ScrollAnchor,
  type ScrollMap,
} from "@/lib/editor/railScrollMap";

/** Ease toward the other pane (lower = slower / smoother). */
const LINK_EASE = 0.22;
/**
 * Reading line, as a fraction of the essay viewport height. A marker on this
 * line has its note level with it in the rail.
 */
const FOCUS_LINE = 0.3;

/**
 * Scrollable gutter of every footnote. When linked, the rail keeps the notes
 * for the markers on screen beside them (either pane can drive the other; see
 * `railScrollMap`) and clicking a note scrolls
 * the essay to it. When unlocked, the rail is fully independent: clicking a
 * note opens it in place without moving the essay.
 */
export function SidenoteRail({
  editor,
  scrollRoot,
  onRootChange,
  onCollapse,
}: {
  editor: Editor;
  scrollRoot: HTMLElement | null;
  /** Expose the rail DOM for link hover previews (same as the main editor). */
  onRootChange?: (el: HTMLElement | null) => void;
  /** Collapse the rail to its slim toggle (like the Outline pane). */
  onCollapse?: () => void;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onRootChange?.(asideRef.current);
    return () => onRootChange?.(null);
  }, [onRootChange]);
  const linkedRef = useRef(true);
  const [linked, setLinked] = useState(true);
  /** Hand scrolling back to the essay (set by the link effect). */
  const releaseToEssayRef = useRef<() => void>(() => {});

  useEffect(() => {
    linkedRef.current = linked;
  }, [linked]);

  const notes = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      footnoteIndexKey.getState(current.state)?.notes ??
      collectRailNotes(current.state.doc),
    equalityFn: railNotesEqual,
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

    /** Anchor map, rebuilt lazily whenever layout may have moved. */
    let map: ScrollMap | null = null;
    let mapEssayHeight = -1;
    let mapRailHeight = -1;

    function invalidate() {
      map = null;
    }

    function buildMap(): ScrollMap {
      const essayRect = essayPane.getBoundingClientRect();
      const railRect = notesPane.getBoundingClientRect();
      // A shared reading line, in client coordinates, expressed per pane.
      const focusEssay = essayPane.clientHeight * FOCUS_LINE;
      const focusRail = focusEssay + essayRect.top - railRect.top;
      const anchors: ScrollAnchor[] = [];
      const items = notesPane.querySelectorAll<HTMLElement>("[data-rail-id]");
      for (const item of items) {
        const id = item.dataset.railId;
        if (!id) continue;
        const ref = essayPane.querySelector<HTMLElement>(
          `.footnote-node[data-footnote-id="${CSS.escape(id)}"] .footnote-ref`
        );
        if (!ref) continue;
        const note = item.querySelector<HTMLElement>(".footnote-sidenote") ?? item;
        const refY =
          ref.getBoundingClientRect().top - essayRect.top + essayPane.scrollTop;
        const noteY =
          note.getBoundingClientRect().top - railRect.top + notesPane.scrollTop;
        anchors.push({ essay: refY - focusEssay, rail: noteY - focusRail });
      }
      mapEssayHeight = essayPane.scrollHeight;
      mapRailHeight = notesPane.scrollHeight;
      return buildScrollMap(anchors, maxScroll(essayPane), maxScroll(notesPane));
    }

    function currentMap(): ScrollMap {
      if (
        !map ||
        essayPane.scrollHeight !== mapEssayHeight ||
        notesPane.scrollHeight !== mapRailHeight
      ) {
        map = buildMap();
      }
      return map;
    }

    function railTarget(): number {
      return railForEssay(currentMap(), essayPane.scrollTop);
    }

    function essayTarget(): number {
      return essayForRail(currentMap(), notesPane.scrollTop);
    }

    function snapRail() {
      notesPane.scrollTop = railTarget();
    }

    function easeToward(el: HTMLElement, target: number) {
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
        needsMore = easeToward(notesPane, railTarget());
      } else {
        needsMore = easeToward(essayPane, essayTarget());
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
      }, 280);
      scheduleTick();
    }

    function armFromUser(next: "essay" | "rail") {
      return () => {
        if (!linkedRef.current) return;
        markDriver(next);
      };
    }

    function onEssayScroll() {
      if (!linkedRef.current) return;
      // Ignore scroll we caused while easing from the rail.
      if (driver === "rail") return;
      if (driver === "essay") {
        scheduleTick();
        return;
      }
      // Programmatic essay motion (Find, outline): snap the rail only.
      // Never let a leftover rail `scroll` event drive the essay back —
      // that is the opposite-direction jump after a long wheel flick.
      snapRail();
    }

    function onRailScroll() {
      if (!linkedRef.current) return;
      if (driver === "essay") return;
      if (driver === "rail") scheduleTick();
    }

    // Clicking a note arms the rail as driver (pointerdown), which would pull
    // the essay back to the rail's position every frame and cancel the
    // scroll to that note. Let the essay lead instead; the rail follows.
    releaseToEssayRef.current = () => {
      window.clearTimeout(idleTimer);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      driver = null;
    };

    // Relink (or notes changed): snap rail to the essay immediately.
    snapRail();

    function onResize() {
      invalidate();
      if (!linkedRef.current) return;
      snapRail();
    }

    // Typing can move markers without changing either scroll height.
    editor.on("update", invalidate);

    const armEssay = armFromUser("essay");
    const armRail = armFromUser("rail");
    const userOpts: AddEventListenerOptions = { passive: true, capture: true };

    essayPane.addEventListener("scroll", onEssayScroll, { passive: true });
    notesPane.addEventListener("scroll", onRailScroll, { passive: true });
    essayPane.addEventListener("wheel", armEssay, userOpts);
    essayPane.addEventListener("pointerdown", armEssay, userOpts);
    essayPane.addEventListener("touchstart", armEssay, userOpts);
    essayPane.addEventListener("keydown", armEssay, userOpts);
    notesPane.addEventListener("wheel", armRail, userOpts);
    notesPane.addEventListener("pointerdown", armRail, userOpts);
    notesPane.addEventListener("touchstart", armRail, userOpts);
    notesPane.addEventListener("keydown", armRail, userOpts);
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      releaseToEssayRef.current = () => {};
      window.clearTimeout(idleTimer);
      if (frame) window.cancelAnimationFrame(frame);
      essayPane.removeEventListener("scroll", onEssayScroll);
      notesPane.removeEventListener("scroll", onRailScroll);
      essayPane.removeEventListener("wheel", armEssay, userOpts);
      essayPane.removeEventListener("pointerdown", armEssay, userOpts);
      essayPane.removeEventListener("touchstart", armEssay, userOpts);
      essayPane.removeEventListener("keydown", armEssay, userOpts);
      notesPane.removeEventListener("wheel", armRail, userOpts);
      notesPane.removeEventListener("pointerdown", armRail, userOpts);
      notesPane.removeEventListener("touchstart", armRail, userOpts);
      notesPane.removeEventListener("keydown", armRail, userOpts);
      window.removeEventListener("resize", onResize);
      editor.off("update", invalidate);
    };
  }, [editor, scrollRoot, linked, notes]);

  /**
   * Linked: scroll the essay to the marker (the rail follows) and open it.
   * Unlocked: the panes are independent, so leave the essay where it is and
   * open the note's card beside its rail row.
   */
  function activate(id: string, rowEl: HTMLElement | null) {
    if (!scrollRoot || !id) return;
    if (!linkedRef.current && openFootnoteCardNear(id, rowEl)) return;
    const ref = scrollRoot.querySelector<HTMLElement>(
      `[data-footnote-id="${CSS.escape(id)}"] .footnote-ref`
    );
    if (!ref) return;
    releaseToEssayRef.current();
    // Land the marker on the reading line, where its note lines up.
    const offset =
      ref.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top;
    scrollRoot.scrollTo({
      top: scrollRoot.scrollTop + offset - scrollRoot.clientHeight * FOCUS_LINE,
      behavior: "smooth",
    });
    ref.click();
  }

  return (
    <aside
      ref={asideRef}
      className={`sidenote-rail ${linked ? "is-linked" : "is-unlocked"}`}
      aria-label="Footnotes"
    >
      <div className="sidenote-rail-toolbar">
        <button
          type="button"
          className="sidenote-rail-lock"
          aria-pressed={linked}
          title={
            linked
              ? "Unlock: scroll notes independently"
              : "Lock: scroll notes with the essay"
          }
          aria-label={
            linked
              ? "Unlock sidenote scrolling from the essay"
              : "Lock sidenote scrolling to the essay"
          }
          onClick={() => setLinked((value) => !value)}
        >
          {linked ? <LockIcon locked /> : <LockIcon locked={false} />}
        </button>
        {onCollapse ? (
          <button
            type="button"
            className="sidenote-rail-toggle"
            aria-expanded
            title="Collapse footnotes"
            aria-label="Collapse footnotes"
            onClick={onCollapse}
          >
            <span className="sidenote-rail-label">Footnotes</span>
            <PanelCaret direction="right" />
          </button>
        ) : (
          <span className="sidenote-rail-label">Footnotes</span>
        )}
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
              data-footnote-id={note.id}
              className="sidenote-rail-item"
            >
              <FootnoteSidenote
                number={note.number}
                markdown={note.content}
                onActivate={() =>
                  activate(
                    note.id,
                    railRef.current?.querySelector<HTMLElement>(
                      `[data-rail-id="${CSS.escape(note.id)}"]`
                    ) ?? null
                  )
                }
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
