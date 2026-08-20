"use client";

import { useEffect, useRef, useState } from "react";
import {
  bibleAppSrc,
  onBibleAppMessage,
  registerBibleIframe,
  syncBibleTheme,
} from "@/lib/bible/bridge";

export function BiblePinBody() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [src] = useState(() => bibleAppSrc());

  useEffect(() => {
    registerBibleIframe(iframeRef.current);
    window.addEventListener("message", onBibleAppMessage);
    const root = document.documentElement;
    const observer = new MutationObserver(() => syncBibleTheme());
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => {
      registerBibleIframe(null);
      window.removeEventListener("message", onBibleAppMessage);
      observer.disconnect();
    };
  }, []);

  return (
    <iframe
      ref={iframeRef}
      className="bible-pin-frame"
      src={src}
      title="fetch(bible) reader"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
