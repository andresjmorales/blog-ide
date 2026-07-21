"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { PanelId } from "@/lib/panels/layout";

/**
 * Keep dockable panel React trees alive across dock moves by hosting each
 * panel in a stable DOM node that is reparented into the active slot.
 */

export function usePanelTargets() {
  const [targets, setTargets] = useState<
    Partial<Record<PanelId, HTMLElement | null>>
  >({});

  const register = useCallback((id: PanelId, el: HTMLElement | null) => {
    setTargets((prev) => (prev[id] === el ? prev : { ...prev, [id]: el }));
  }, []);

  /** Clear only if `el` is still the registered target (avoids races on move). */
  const unregister = useCallback((id: PanelId, el: HTMLElement | null) => {
    if (!el) return;
    setTargets((prev) => (prev[id] === el ? { ...prev, [id]: null } : prev));
  }, []);

  return { targets, register, unregister };
}

export function PanelSlot({
  panelId,
  register,
  unregister,
  className,
  hidden,
}: {
  panelId: PanelId;
  register: (id: PanelId, el: HTMLElement | null) => void;
  unregister?: (id: PanelId, el: HTMLElement | null) => void;
  className?: string;
  /** Keep slot mounted (and panel warm) while another tab is active. */
  hidden?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    register(panelId, el);
    return () => {
      if (unregister) unregister(panelId, el);
      else register(panelId, null);
    };
  }, [panelId, register, unregister]);

  return (
    <div
      ref={ref}
      hidden={hidden}
      className={
        hidden
          ? undefined
          : (className ?? "flex min-h-0 flex-1 flex-col overflow-hidden")
      }
    />
  );
}

function subscribeNoop() {
  return () => {};
}

/** True after hydration; false during SSR. */
function useIsClient() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export function PersistentPanel({
  target,
  children,
  className = "flex h-full min-h-0 flex-col",
}: {
  target: HTMLElement | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  const isClient = useIsClient();
  const parkRef = useRef<HTMLDivElement | null>(null);

  // Create once on the client (not in an effect — avoids cascading setState).
  const host = useMemo(() => {
    if (!isClient) return null;
    const el = document.createElement("div");
    // The host must fill its slot: a bare div sizes to its content, which
    // let tall panels (e.g. a long Shell log) overflow the dock's clipped
    // region — pinned footers like the send row ended up cut off.
    el.style.cssText =
      "display:flex;flex-direction:column;flex:1 1 0%;min-height:0;height:100%;overflow:hidden;";
    return el;
  }, [isClient]);

  useLayoutEffect(() => {
    if (!host) return;
    const parent = target ?? parkRef.current;
    if (parent && host.parentElement !== parent) {
      parent.appendChild(host);
    }
  }, [host, target]);

  useLayoutEffect(() => {
    return () => {
      host?.remove();
    };
  }, [host]);

  return (
    <>
      <div ref={parkRef} className="hidden" aria-hidden />
      {host
        ? createPortal(
            <div className={className}>{children}</div>,
            host
          )
        : null}
    </>
  );
}
