import "server-only";

/**
 * Optional transactional email through Resend's HTTP API. Off unless both
 * RESEND_API_KEY and BLOGIDE_EMAIL_FROM are set; callers fall back to the
 * owner's own mail app.
 */
export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.BLOGIDE_EMAIL_FROM?.trim()
  );
}

export class EmailSendError extends Error {}

export async function sendEmail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
}): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.BLOGIDE_EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new EmailSendError("Email is not configured.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as
    | { id?: string; message?: string }
    | null;
  if (!res.ok) {
    throw new EmailSendError(data?.message || `Resend returned ${res.status}.`);
  }
  return { id: data?.id ?? null };
}
