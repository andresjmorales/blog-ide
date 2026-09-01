"use client";

import { useEffect, useState } from "react";
import { SettingsInfo } from "@/components/SettingsInfo";
import { pushbulletWhoAmI } from "@/lib/pushbullet/client";
import { deviceNickname } from "@/lib/pushbullet/devices";
import {
  loadPushbulletStatus,
  PUSHBULLET_STATUS_EVENT,
  savePushbulletStatus,
} from "@/lib/pushbullet/status";
import { syncPushbulletDevices } from "@/lib/pushbullet/sync";
import {
  clearPushbulletToken,
  loadPushbulletToken,
  maskPushbulletToken,
  PUSHBULLET_TOKEN_EVENT,
  savePushbulletToken,
} from "@/lib/pushbullet/token";
import type { PushbulletRuntimeStatus } from "@/lib/pushbullet/types";

export type PushbulletChannelOption = {
  id: string;
  name: string;
};

type Props = {
  previewMode?: boolean;
  channels?: PushbulletChannelOption[];
};

export function PushbulletSettingsSection({
  previewMode = false,
  channels = [],
}: Props) {
  const [tokenDraft, setTokenDraft] = useState("");
  const [savedToken, setSavedToken] = useState(() => loadPushbulletToken());
  const [status, setStatus] = useState<PushbulletRuntimeStatus>(() =>
    loadPushbulletStatus()
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function refresh() {
      setSavedToken(loadPushbulletToken());
      setStatus(loadPushbulletStatus());
    }
    window.addEventListener(PUSHBULLET_TOKEN_EVENT, refresh);
    window.addEventListener(PUSHBULLET_STATUS_EVENT, refresh);
    return () => {
      window.removeEventListener(PUSHBULLET_TOKEN_EVENT, refresh);
      window.removeEventListener(PUSHBULLET_STATUS_EVENT, refresh);
    };
  }, []);

  if (previewMode) {
    return (
      <section className="settings-section">
        <h3>
          Pushbullet
          <SettingsInfo text="Sign in to capture notes sent to virtual Pushbullet devices into Notes channels. The access token stays on this device." />
        </h3>
        <p className="settings-help">Sign in to connect Pushbullet.</p>
      </section>
    );
  }

  return (
    <section className="settings-section">
      <h3>
        Pushbullet
        <SettingsInfo text="Paste an access token from Pushbullet Account Settings. BlogIDE creates a virtual device per Notes channel (BlogIDE · general, and so on). Keep using Pushbullet as usual; send a note, link, or file to one of those devices to append it to that channel. Pushes to all devices are left alone. There is no webhook: BlogIDE polls and listens while this tab is open, and catches up the next time you visit." />
      </h3>
      <label className="settings-row settings-row-stack">
        <span>Access token</span>
        <input
          type="password"
          autoComplete="off"
          className="settings-text-input"
          placeholder={
            savedToken
              ? `Saved · ${maskPushbulletToken(savedToken)}`
              : "From pushbullet.com/#settings"
          }
          value={tokenDraft}
          onChange={(e) => setTokenDraft(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
          onClick={() => {
            if (!tokenDraft.trim()) return;
            savePushbulletToken(tokenDraft.trim());
            setSavedToken(tokenDraft.trim());
            setTokenDraft("");
            setMessage("Token saved on this device.");
          }}
        >
          Save token
        </button>
        {savedToken ? (
          <button
            type="button"
            className="settings-link-btn"
            onClick={() => {
              clearPushbulletToken();
              setSavedToken("");
              setTokenDraft("");
              setMessage("Token removed from this device.");
            }}
          >
            Remove token
          </button>
        ) : null}
        <button
          type="button"
          className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
          disabled={busy || !loadPushbulletToken()}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setMessage(null);
              try {
                const me = await pushbulletWhoAmI(loadPushbulletToken());
                if (me.email) {
                  savePushbulletStatus({ email: me.email, lastError: null });
                }
                setMessage(
                  me.email
                    ? `Token works as ${me.email}.`
                    : "Token works."
                );
              } catch (err) {
                setMessage(
                  err instanceof Error
                    ? err.message
                    : "Could not verify token."
                );
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Test token
        </button>
        <button
          type="button"
          className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
          disabled={busy || !loadPushbulletToken() || channels.length === 0}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setMessage(null);
              try {
                const plan = await syncPushbulletDevices(
                  loadPushbulletToken(),
                  channels
                );
                setMessage(
                  `Devices ready (${plan.map.length} Notes channel${
                    plan.map.length === 1 ? "" : "s"
                  }).`
                );
              } catch (err) {
                setMessage(
                  err instanceof Error
                    ? err.message
                    : "Could not sync devices."
                );
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Create devices
        </button>
      </div>
      {channels.length === 0 ? (
        <p className="settings-help mt-3">
          Notes channels appear here after the workspace loads. Create one from
          the Notes panel, then come back and create devices.
        </p>
      ) : (
        <>
          <h4 className="settings-section-subhead">Device targets</h4>
          <ul className="mb-2 list-none space-y-1 p-0 text-xs">
            {channels.map((channel) => (
              <li key={channel.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{channel.name}</span>
                <span className="text-muted">
                  → {deviceNickname(channel.name)}
                </span>
              </li>
            ))}
          </ul>
          <p className="settings-help">
            In the Pushbullet app or browser extension, send to that device
            instead of all devices.
          </p>
        </>
      )}
      {status.email || status.lastSyncAt || status.lastError ? (
        <p className="mt-2 text-xs text-muted">
          {status.lastError
            ? status.lastError
            : status.lastSyncAt
              ? `Last catch-up ${new Date(status.lastSyncAt).toLocaleString()}.`
              : null}
        </p>
      ) : null}
      {message ? <p className="mt-2 text-xs text-muted">{message}</p> : null}
    </section>
  );
}
