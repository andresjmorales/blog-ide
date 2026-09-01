"use client";

import { useEffect, useState } from "react";
import { SettingsInfo } from "@/components/SettingsInfo";
import type { PushbulletChannelOption } from "@/components/PushbulletSettingsSection";
import {
  DEFAULT_NTFY_SERVER,
  loadNtfySecrets,
  ntfyTopicForChannel,
  ntfyTopicUrl,
  NTFY_SECRETS_EVENT,
  saveNtfySecrets,
} from "@/lib/ntfy/settings";

type Props = {
  previewMode?: boolean;
  channels?: PushbulletChannelOption[];
};

export function NtfySettingsSection({
  previewMode = false,
  channels = [],
}: Props) {
  const saved = loadNtfySecrets();
  const [server, setServer] = useState(saved?.server ?? DEFAULT_NTFY_SERVER);
  const [tokenDraft, setTokenDraft] = useState("");
  const [hasToken, setHasToken] = useState(Boolean(saved?.token));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [topics, setTopics] = useState(saved?.topics ?? []);

  useEffect(() => {
    function refresh() {
      const next = loadNtfySecrets();
      setServer(next?.server ?? DEFAULT_NTFY_SERVER);
      setHasToken(Boolean(next?.token));
      setTopics(next?.topics ?? []);
    }
    window.addEventListener(NTFY_SECRETS_EVENT, refresh);
    return () => window.removeEventListener(NTFY_SECRETS_EVENT, refresh);
  }, []);

  if (previewMode) {
    return (
      <section className="settings-section">
        <h3>
          ntfy
          <SettingsInfo text="Sign in to capture ntfy messages into Notes channels. Topic names and tokens are stored encrypted on your account." />
        </h3>
        <p className="settings-help">Sign in to connect ntfy.</p>
      </section>
    );
  }

  return (
    <section className="settings-section">
      <h3>
        ntfy
        <SettingsInfo text="Open-source push alternative. On ntfy.sh a topic name is the password unless you reserve it (Pro) or run your own server with access control. BlogIDE generates an unguessable topic per Notes channel. POST to that URL (curl, the ntfy app, or a script) and the message lands in that channel. Self-hosting ntfy is a small Docker/Go server, not a Vercel app." />
      </h3>
      <label className="settings-row settings-row-stack">
        <span>Server</span>
        <input
          className="settings-text-input"
          value={server}
          onChange={(e) => setServer(e.target.value)}
          placeholder={DEFAULT_NTFY_SERVER}
        />
      </label>
      <label className="settings-row settings-row-stack">
        <span>Access token (optional)</span>
        <input
          type="password"
          autoComplete="off"
          className="settings-text-input"
          placeholder={
            hasToken ? "Saved on your account" : "For reserved topics or a private server"
          }
          value={tokenDraft}
          onChange={(e) => setTokenDraft(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-40"
          disabled={busy || channels.length === 0}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setMessage(null);
              try {
                const current = loadNtfySecrets();
                const nextTopics = channels.map((channel) => {
                  const existing = current?.topics.find(
                    (row) => row.channelId === channel.id
                  );
                  return (
                    existing ?? {
                      channelId: channel.id,
                      channelName: channel.name,
                      topic: ntfyTopicForChannel(channel.name),
                    }
                  );
                });
                const token = tokenDraft.trim() || current?.token;
                const ok = await saveNtfySecrets({
                  server: server.trim() || DEFAULT_NTFY_SERVER,
                  token,
                  topics: nextTopics,
                });
                setTokenDraft("");
                setHasToken(Boolean(token));
                setTopics(nextTopics);
                setMessage(
                  ok
                    ? "Topics saved to your account."
                    : "Saved on this device. Account sync failed; try again while online."
                );
              } catch (err) {
                setMessage(
                  err instanceof Error ? err.message : "Could not save ntfy settings."
                );
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Create topics
        </button>
        {topics.length > 0 ? (
          <button
            type="button"
            className="settings-link-btn"
            onClick={() => {
              void (async () => {
                await saveNtfySecrets(null);
                setHasToken(false);
                setTopics([]);
                setTokenDraft("");
                setMessage("ntfy disconnected.");
              })();
            }}
          >
            Disconnect
          </button>
        ) : null}
      </div>
      {topics.length === 0 ? (
        <p className="settings-help mt-3">
          Create topics after your Notes channels load. Each channel gets its
          own unguessable topic.
        </p>
      ) : (
        <>
          <h4 className="settings-section-subhead">Publish URLs</h4>
          <ul className="mb-2 list-none space-y-1 p-0 text-xs">
            {topics.map((row) => {
              const url = ntfyTopicUrl(server, row.topic);
              const name =
                channels.find((c) => c.id === row.channelId)?.name ??
                row.channelName;
              return (
                <li
                  key={row.channelId}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="font-medium">{name}</span>
                  <span className="text-muted break-all">{url}</span>
                  <button
                    type="button"
                    className="settings-link-btn"
                    onClick={() => {
                      void navigator.clipboard.writeText(url).then(() => {
                        setMessage(`Copied ${name} URL.`);
                      });
                    }}
                  >
                    Copy
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="settings-help">
            Example: curl -d &quot;shower thought&quot; that URL
          </p>
        </>
      )}
      {message ? <p className="mt-2 text-xs text-muted">{message}</p> : null}
    </section>
  );
}
