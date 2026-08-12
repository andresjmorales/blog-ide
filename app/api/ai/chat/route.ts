import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireUser";
import {
  defaultModelForProvider,
  resolveModel,
} from "@/lib/ai/models";
import type { AiProvider } from "@/lib/ai/keys";

export const runtime = "nodejs";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type Body = {
  provider: "anthropic" | "openai";
  messages: ChatMessage[];
  /** Optional one-shot system prompt override. */
  system?: string;
  /** Optional model id; validated against the light allowlist. */
  model?: string;
  /** When true, respond with text/event-stream deltas. */
  stream?: boolean;
};

/**
 * Thin BYOK proxy. The API key arrives on each request and is never stored.
 * Browser SDKs can't call Anthropic/OpenAI directly due to CORS.
 * Hosted cost control: no server-side provider key — users bring their own.
 */
export async function POST(request: Request) {
  const denied = await requireUser();
  if (denied) return denied;

  const apiKey =
    request.headers.get("x-api-key")?.trim() ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing API key. Add one under Account settings." },
      { status: 401 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body?.provider || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "Invalid chat payload." }, { status: 400 });
  }

  const provider = body.provider as AiProvider;
  const model = resolveModel(provider, body.model);

  try {
    if (body.stream) {
      if (provider === "anthropic") {
        return await streamAnthropic(apiKey, body, model);
      }
      return await streamOpenAi(apiKey, body, model);
    }
    if (provider === "anthropic") {
      return await chatAnthropic(apiKey, body, model);
    }
    return await chatOpenAi(apiKey, body, model);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

function encodeSse(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function encodeSseDone(): Uint8Array {
  return new TextEncoder().encode("data: [DONE]\n\n");
}

async function chatAnthropic(apiKey: string, body: Body, model: string) {
  const system =
    body.system ||
    body.messages.find((m) => m.role === "system")?.content ||
    undefined;
  const messages = body.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || defaultModelForProvider("anthropic"),
      max_tokens: 8192,
      system,
      messages,
    }),
  });

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || `Anthropic HTTP ${response.status}`);
  }

  const text = (payload.content ?? [])
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n");

  return NextResponse.json({ text });
}

async function streamAnthropic(apiKey: string, body: Body, model: string) {
  const system =
    body.system ||
    body.messages.find((m) => m.role === "system")?.content ||
    undefined;
  const messages = body.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || defaultModelForProvider("anthropic"),
      max_tokens: 8192,
      system,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(
      payload.error?.message || `Anthropic HTTP ${response.status}`
    );
  }

  const upstream = response.body;
  if (!upstream) throw new Error("Anthropic returned no stream.");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const event = JSON.parse(data) as {
                type?: string;
                delta?: { type?: string; text?: string };
                error?: { message?: string };
              };
              if (event.error?.message) {
                controller.enqueue(
                  encodeSse({ error: event.error.message })
                );
                continue;
              }
              if (
                event.type === "content_block_delta" &&
                event.delta?.type === "text_delta" &&
                event.delta.text
              ) {
                controller.enqueue(encodeSse({ text: event.delta.text }));
              }
            } catch {
              // ignore malformed upstream lines
            }
          }
        }
        controller.enqueue(encodeSseDone());
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Stream failed.";
        controller.enqueue(encodeSse({ error: message }));
      } finally {
        controller.close();
      }
    },
  });

  return sseResponse(stream);
}

async function chatOpenAi(apiKey: string, body: Body, model: string) {
  const messages = body.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  if (body.system && !messages.some((m) => m.role === "system")) {
    messages.unshift({ role: "system", content: body.system });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || defaultModelForProvider("openai"),
      messages,
    }),
  });

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI HTTP ${response.status}`);
  }

  const text = payload.choices?.[0]?.message?.content ?? "";
  return NextResponse.json({ text });
}

async function streamOpenAi(apiKey: string, body: Body, model: string) {
  const messages = body.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  if (body.system && !messages.some((m) => m.role === "system")) {
    messages.unshift({ role: "system", content: body.system });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || defaultModelForProvider("openai"),
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(payload.error?.message || `OpenAI HTTP ${response.status}`);
  }

  const upstream = response.body;
  if (!upstream) throw new Error("OpenAI returned no stream.");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const event = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
                error?: { message?: string };
              };
              if (event.error?.message) {
                controller.enqueue(
                  encodeSse({ error: event.error.message })
                );
                continue;
              }
              const chunk = event.choices?.[0]?.delta?.content;
              if (chunk) controller.enqueue(encodeSse({ text: chunk }));
            } catch {
              // ignore malformed upstream lines
            }
          }
        }
        controller.enqueue(encodeSseDone());
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Stream failed.";
        controller.enqueue(encodeSse({ error: message }));
      } finally {
        controller.close();
      }
    },
  });

  return sseResponse(stream);
}
