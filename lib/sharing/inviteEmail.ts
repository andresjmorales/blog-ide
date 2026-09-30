import type { ShareRole } from "@/lib/sharing/types";

export type ShareInviteEmail = { subject: string; text: string; html: string };

const ROLE_VERB: Record<ShareRole, string> = {
  viewer: "read",
  commenter: "read and comment on",
  suggester: "read, comment on, and suggest edits to",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strip the .md suffix the Files tree keeps on essay names. */
export function essayTitleFromNodeName(name: string): string {
  return name.replace(/\.md$/i, "").trim() || "Untitled";
}

/**
 * Invite sent by BlogIDE. Never includes essay text: only the title, who
 * shared it, the access level, and the link.
 */
export function buildShareInviteEmail(input: {
  title: string;
  link: string;
  role: ShareRole;
  inviteeEmail: string;
  senderName: string;
}): ShareInviteEmail {
  const sender = input.senderName.trim() || "Someone";
  const verb = ROLE_VERB[input.role];
  const subject = `${sender} shared a draft: ${input.title}`;
  const signIn = `Sign in to BlogIDE with ${input.inviteeEmail} to open it. If you don't have an account yet, the link lets you create one.`;
  const text = [
    `${sender} invited you to ${verb} “${input.title}”.`,
    "",
    input.link,
    "",
    signIn,
    "",
    "This link is just for you; please don't forward it.",
  ].join("\n");

  const font = "Georgia, 'Times New Roman', serif";
  const p = (body: string, extra = "") =>
    `<p style="margin-top:0;margin-bottom:16px;font-family:${font};font-size:16px;line-height:24px;color:#1f2937;${extra}">${body}</p>`;
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f5f2;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f5f2" style="background-color:#f6f5f2;">
<tr><td align="center" style="padding-top:32px;padding-bottom:32px;padding-left:16px;padding-right:16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:560px;background-color:#ffffff;border-radius:8px;">
<tr><td style="padding-top:32px;padding-bottom:32px;padding-left:32px;padding-right:32px;">
${p(`${escapeHtml(sender)} invited you to ${escapeHtml(verb)}`)}
${p(`“${escapeHtml(input.title)}”`, "font-size:22px;line-height:30px;font-weight:bold;")}
<table cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;margin-bottom:24px;"><tr>
<td bgcolor="#2563eb" style="background-color:#2563eb;border-radius:6px;">
<a href="${escapeHtml(input.link)}" style="display:inline-block;padding-top:12px;padding-bottom:12px;padding-left:20px;padding-right:20px;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:20px;color:#ffffff;text-decoration:none;font-weight:bold;">Open the draft</a>
</td></tr></table>
${p(escapeHtml(signIn), "font-size:14px;line-height:21px;color:#4b5563;")}
${p("This link is just for you; please don't forward it.", "font-size:13px;line-height:19px;color:#6b7280;margin-bottom:0;")}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return { subject, text, html };
}
