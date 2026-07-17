import { NextResponse } from "next/server";

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
};

/**
 * Thin BYOK proxy. The API key arrives on each request and is never stored.
 * Browser SDKs can't call Anthropic/OpenAI directly due to CORS.
 */
export async function POST(request: Request) {
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

  try {
    if (body.provider === "anthropic") {
      return await chatAnthropic(apiKey, body);
    }
    return await chatOpenAi(apiKey, body);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function chatAnthropic(apiKey: string, body: Body) {
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
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
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

async function chatOpenAi(apiKey: string, body: Body) {
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
      model: "gpt-4o-mini",
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
