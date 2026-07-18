"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
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

export function PersistentPanel({
  target,
  children,
  className = "flex h-full min-h-0 flex-col",
}: {
  target: HTMLElement | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const parkRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = document.createElement("div");
    el.className = className;
    setHost(el);
    return () => {
      el.remove();
      setHost(null);
    };
    // Host is created once; className synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (host) host.className = className;
  }, [host, className]);

  useLayoutEffect(() => {
    if (!host) return;
    const parent = target ?? parkRef.current;
    if (parent && host.parentElement !== parent) {
      parent.appendChild(host);
    }
  }, [host, target]);

  return (
    <>
      <div ref={parkRef} className="hidden" aria-hidden />
      {host ? createPortal(children, host) : null}
    </>
  );
}
