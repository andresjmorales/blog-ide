import { registerCaptureIngest } from "@/lib/capture/refresh";
import { ingestNtfyMessages } from "@/lib/ntfy/ingest";
import { ntfyStreamUrl } from "@/lib/ntfy/client";
import { loadNtfySecrets, NTFY_SECRETS_EVENT } from "@/lib/ntfy/settings";

const POLL_MS = 120_000;

type CaptureSession = {
  stop: () => void;
};

export function startNtfyCapture(): CaptureSession {
  let stopped = false;
  let socket: WebSocket | null = null;
  let pollTimer: number | null = null;
  let retryTimer: number | null = null;
  let ingesting: Promise<void> | null = null;
  let retryMs = 1_000;

  function ingest(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (ingesting) return ingesting;
    ingesting = ingestNtfyMessages()
      .then(() => {
        retryMs = 1_000;
      })
      .catch(() => {
        // Status lives in ntfy settings UI after a manual test; keep silent here.
      })
      .finally(() => {
        ingesting = null;
      });
    return ingesting;
  }

  function stopSocket() {
    if (!socket) return;
    socket.onmessage = null;
    socket.onclose = null;
    socket.close();
    socket = null;
  }

  function scheduleReconnect() {
    if (stopped || retryTimer != null) return;
    if (!loadNtfySecrets()?.topics.length) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      connectSocket();
    }, retryMs);
    retryMs = Math.min(retryMs * 2, 60_000);
  }

  function connectSocket() {
    if (stopped) return;
    const secrets = loadNtfySecrets();
    if (!secrets || typeof WebSocket === "undefined") return;
    const url = ntfyStreamUrl(secrets);
    if (!url) return;
    stopSocket();
    try {
      socket = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const parsed = JSON.parse(event.data) as { event?: string };
        if (!parsed.event || parsed.event === "message") void ingest();
      } catch {
        void ingest();
      }
    };
    socket.onclose = () => {
      socket = null;
      scheduleReconnect();
    };
  }

  function onSecretsChange() {
    stopSocket();
    if (retryTimer != null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
    retryMs = 1_000;
    if (!loadNtfySecrets()?.topics.length) return;
    void ingest().then(() => connectSocket());
  }

  function onVisibility() {
    if (document.visibilityState !== "visible") return;
    void ingest();
    if (!socket && loadNtfySecrets()?.topics.length) connectSocket();
  }

  if (loadNtfySecrets()?.topics.length) {
    void ingest().then(() => connectSocket());
  }

  pollTimer = window.setInterval(() => {
    void ingest();
  }, POLL_MS);
  window.addEventListener(NTFY_SECRETS_EVENT, onSecretsChange);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onVisibility);
  const unregisterIngest = registerCaptureIngest(ingest);

  return {
    stop() {
      stopped = true;
      unregisterIngest();
      if (pollTimer != null) window.clearInterval(pollTimer);
      if (retryTimer != null) window.clearTimeout(retryTimer);
      window.removeEventListener(NTFY_SECRETS_EVENT, onSecretsChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      stopSocket();
    },
  };
}
