"use client";

import { useEffect, useState } from "react";
import type { LinkPin } from "@/lib/pins/pinStore";
import { fetchReaderExtract } from "@/lib/preview/client";

export function LinkPinBody({ pin }: { pin: LinkPin }) {
  const [text, setText] = useState<string | null>(null);
  const [manualBusy, setManualBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoBusy =
    pin.autoExtract === true && text === null && error === null;
  const busy = manualBusy || autoBusy;

  async function loadReader() {
    setManualBusy(true);
    setError(null);
    try {
      const result = await fetchReaderExtract(pin.url);
      setText(result.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load extract");
    } finally {
      setManualBusy(false);
    }
  }

  useEffect(() => {
    if (!pin.autoExtract) return;
    let cancelled = false;
    void fetchReaderExtract(pin.url)
      .then((result) => {
        if (!cancelled) setText(result.text);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load extract"
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pin.autoExtract, pin.url]);

  return (
    <div className="link-pin-body">
      {pin.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pin.image} alt="" className="link-pin-image" />
      )}
      {pin.siteName && (
        <p className="link-pin-site">{pin.siteName}</p>
      )}
      {pin.description && (
        <p className="link-pin-desc">{pin.description}</p>
      )}
      <div className="link-pin-actions">
        <a
          href={pin.url}
          target="_blank"
          rel="noreferrer"
          className="pinned-surface-btn"
        >
          Open tab
        </a>
        <button
          type="button"
          className="pinned-surface-btn"
          disabled={busy}
          onClick={() => void loadReader()}
        >
          {busy ? "Loading…" : text ? "Reload extract" : "Read extract"}
        </button>
      </div>
      {error && <p className="popout-error">{error}</p>}
      {text && (
        <div className="link-pin-extract">
          <p className="link-pin-extract-note">
            Approximate extract. Select and copy into the essay.
          </p>
          <pre className="link-pin-extract-text">{text}</pre>
        </div>
      )}
    </div>
  );
}
