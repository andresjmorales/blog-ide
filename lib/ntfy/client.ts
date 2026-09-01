import type { NtfySecrets } from "@/lib/secrets/types";
import { ntfyServerOrigin } from "@/lib/ntfy/settings";

export type NtfyMessage = {
  id: string;
  event?: string;
  time?: number;
  topic?: string;
  title?: string;
  message?: string;
  click?: string;
  attachment?: { name?: string; url?: string };
};

export class NtfyApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "NtfyApiError";
    this.status = status;
  }
}

function authHeaders(token?: string): Headers {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export async function pollNtfyMessages(input: {
  secrets: NtfySecrets;
  since?: string | number;
}): Promise<NtfyMessage[]> {
  const topics = input.secrets.topics.map((row) => row.topic).filter(Boolean);
  if (topics.length === 0) return [];
  const origin = ntfyServerOrigin(input.secrets.server);
  const path = topics.map(encodeURIComponent).join(",");
  const params = new URLSearchParams({ poll: "1" });
  if (input.since != null && input.since !== "") {
    params.set("since", String(input.since));
  }
  const res = await fetch(`${origin}/${path}/json?${params}`, {
    headers: authHeaders(input.secrets.token),
  });
  if (!res.ok) {
    throw new NtfyApiError(`ntfy request failed (${res.status})`, res.status);
  }
  const text = await res.text();
  const messages: NtfyMessage[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as NtfyMessage;
      if (parsed && parsed.id) messages.push(parsed);
    } catch {
      // skip malformed frames
    }
  }
  return messages;
}

export function ntfyStreamUrl(secrets: NtfySecrets): string | null {
  if (secrets.token) return null;
  const topics = secrets.topics.map((row) => row.topic).filter(Boolean);
  if (topics.length === 0) return null;
  const origin = ntfyServerOrigin(secrets.server).replace(/^http/i, "ws");
  const path = topics.map(encodeURIComponent).join(",");
  return `${origin}/${path}/ws`;
}
