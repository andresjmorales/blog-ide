import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { EmailSendError, isEmailConfigured, sendEmail } from "@/lib/email/resend";
import {
  buildShareInviteEmail,
  essayTitleFromNodeName,
} from "@/lib/sharing/inviteEmail";

const LINK = `https://blogide.com/s/${"a".repeat(64)}`;

describe("buildShareInviteEmail", () => {
  it("names the sender, essay, access, and link", () => {
    const email = buildShareInviteEmail({
      title: "On Rest",
      link: LINK,
      role: "commenter",
      inviteeEmail: "wife@example.com",
      senderName: "Andres",
    });
    expect(email.subject).toBe("Andres shared a draft: On Rest");
    expect(email.text).toContain("invited you to read and comment on “On Rest”");
    expect(email.text).toContain(LINK);
    expect(email.text).toContain("wife@example.com");
    expect(email.html).toContain(`href="${LINK}"`);
  });

  it("escapes titles and names in the HTML body", () => {
    const email = buildShareInviteEmail({
      title: `<script>x</script> & "quotes"`,
      link: LINK,
      role: "viewer",
      inviteeEmail: "a@b.co",
      senderName: "<b>Eve</b>",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>Eve</b>");
    expect(email.html).toContain("&lt;script&gt;x&lt;/script&gt; &amp; &quot;quotes&quot;");
  });

  it("uses the Files name without .md for the title", () => {
    expect(essayTitleFromNodeName("On Rest.md")).toBe("On Rest");
    expect(essayTitleFromNodeName(".md")).toBe("Untitled");
  });
});

describe("sendEmail (Resend)", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.BLOGIDE_EMAIL_FROM = "BlogIDE <drafts@blogide.com>";
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("is off unless both the key and sender are set", () => {
    expect(isEmailConfigured()).toBe(true);
    delete process.env.BLOGIDE_EMAIL_FROM;
    expect(isEmailConfigured()).toBe(false);
  });

  it("posts one message to the Resend API with a reply-to", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "email_1" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendEmail({
      to: "wife@example.com",
      subject: "s",
      text: "t",
      html: "<p>h</p>",
      replyTo: "andres@example.com",
    });
    expect(result.id).toBe("email_1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer re_test"
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: "BlogIDE <drafts@blogide.com>",
      to: ["wife@example.com"],
      reply_to: "andres@example.com",
    });
  });

  it("surfaces Resend's error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ message: "Domain not verified" }), {
          status: 403,
        })
      )
    );
    await expect(
      sendEmail({ to: "a@b.co", subject: "s", text: "t", html: "h" })
    ).rejects.toThrow(new EmailSendError("Domain not verified"));
  });
});
