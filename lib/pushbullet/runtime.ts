import { registerCaptureIngest } from "@/lib/capture/refresh";
import { channelDisplayName, listInboxChannels } from "@/lib/workspace/tree";
import type { WorkspaceNode } from "@/lib/workspace/types";
import { PushbulletApiError, pushbulletStreamUrl } from "@/lib/pushbullet/client";
import { ingestPushbulletPushes } from "@/lib/pushbullet/sync";
import { savePushbulletStatus } from "@/lib/pushbullet/status";
import {
  loadPushbulletToken,
  PUSHBULLET_TOKEN_EVENT,
} from "@/lib/pushbullet/token";

const POLL_MS = 120_000;
const DEVICE_DEBOUNCE_MS = 1_500;

type GetNodes = () => WorkspaceNode[];

function channelsFrom(nodes: WorkspaceNode[]): Array<{ id: string; name: string }> {
  return listInboxChannels(nodes).map((node) => ({
    id: node.id,
    name: channelDisplayName(node),
  }));
}

function channelKey(channels: Array<{ id: string; name: string }>): string {
  return channels.map((c) => `${c.id}:${c.name}`).join("|");
}

type CaptureSession = {
  stop: () => void;
  channelsChanged: () => void;
};

/**
 * Catch-up poll plus a websocket tickle listener while BlogIDE is open.
 * Pushes sent while the tab is closed are picked up on the next visit.
 */
export function startPushbulletCapture(getNodes: GetNodes): CaptureSession {
  let stopped = false;
  let socket: WebSocket | null = null;
  let pollTimer: number | null = null;
  let retryTimer: number | null = null;
  let deviceTimer: number | null = null;
  let ingesting: Promise<void> | null = null;
  let retryMs = 1_000;
  let lastChannelKey = "";
  /** After a stream open fails (typical uBlock block), stop retrying. */
  let streamUnavailable = false;

  function channels() {
    return channelsFrom(getNodes());
  }

  function reportError(err: unknown) {
    const message = err instanceof Error ? err.message : "Pushbullet sync failed.";
    savePushbulletStatus({ lastError: message });
    if (err instanceof PushbulletApiError && err.status === 401) {
      stopSocket();
    }
  }

  function ingest(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (ingesting) return ingesting;
    const token = loadPushbulletToken();
    if (!token) return Promise.resolve();
    const list = channels();
    if (list.length === 0) return Promise.resolve();
    ingesting = ingestPushbulletPushes({ token, channels: list })
      .then(() => {
        lastChannelKey = channelKey(list);
        retryMs = 1_000;
      })
      .catch(reportError)
      .finally(() => {
        ingesting = null;
      });
    return ingesting;
  }

  function stopSocket() {
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.close();
    socket = null;
  }

  function scheduleReconnect() {
    if (stopped || retryTimer != null) return;
    if (!loadPushbulletToken()) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      connectSocket();
    }, retryMs);
    retryMs = Math.min(retryMs * 2, 60_000);
  }

  function connectSocket() {
    if (stopped || streamUnavailable) return;
    const token = loadPushbulletToken();
    if (!token || typeof WebSocket === "undefined") return;
    stopSocket();
    let opened = false;
    try {
      socket = new WebSocket(pushbulletStreamUrl(token));
    } catch {
      streamUnavailable = true;
      return;
    }
    socket.onopen = () => {
      opened = true;
      retryMs = 1_000;
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const message = JSON.parse(event.data) as {
          type?: string;
          subtype?: string;
        };
        if (message.type === "tickle" && message.subtype === "push") {
          void ingest();
        }
        if (message.type === "nop") retryMs = 1_000;
      } catch {
        // Ignore malformed stream frames.
      }
    };
    socket.onclose = () => {
      socket = null;
      if (opened) {
        scheduleReconnect();
        return;
      }
      // Never connected: ad blocker or network policy. Polling still catch-up.
      streamUnavailable = true;
    };
  }

  function onTokenChange() {
    stopSocket();
    if (retryTimer != null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
    retryMs = 1_000;
    streamUnavailable = false;
    if (!loadPushbulletToken()) return;
    void ingest().then(() => connectSocket());
  }

  function onVisibility() {
    if (document.visibilityState !== "visible") return;
    void ingest();
    if (!socket && !streamUnavailable && loadPushbulletToken()) {
      connectSocket();
    }
  }

  function channelsChanged() {
    if (stopped) return;
    if (deviceTimer != null) window.clearTimeout(deviceTimer);
    deviceTimer = window.setTimeout(() => {
      deviceTimer = null;
      const next = channelKey(channels());
      if (!next || next === lastChannelKey) return;
      void ingest();
    }, DEVICE_DEBOUNCE_MS);
  }

  if (loadPushbulletToken()) {
    void ingest().then(() => connectSocket());
  }

  pollTimer = window.setInterval(() => {
    void ingest();
  }, POLL_MS);
  window.addEventListener(PUSHBULLET_TOKEN_EVENT, onTokenChange);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onVisibility);
  const unregisterIngest = registerCaptureIngest(ingest);

  return {
    stop() {
      stopped = true;
      unregisterIngest();
      if (pollTimer != null) window.clearInterval(pollTimer);
      if (retryTimer != null) window.clearTimeout(retryTimer);
      if (deviceTimer != null) window.clearTimeout(deviceTimer);
      window.removeEventListener(PUSHBULLET_TOKEN_EVENT, onTokenChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      stopSocket();
    },
    channelsChanged,
  };
}
