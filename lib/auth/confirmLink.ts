import type { EmailOtpType } from "@supabase/supabase-js";

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

export function isEmailOtpType(value: unknown): value is EmailOtpType {
  return (
    typeof value === "string" &&
    (OTP_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Why a confirmation link failed. Only these codes travel in the URL; the
 * page maps them to fixed copy, so a crafted link cannot put arbitrary text
 * on a BlogIDE page.
 */
export type AuthLinkError = "expired" | "missing" | "invalid";

export function authLinkErrorCode(value: string | null): AuthLinkError | null {
  if (value === "expired" || value === "missing" || value === "invalid") {
    return value;
  }
  // Older links used ?error=auth.
  return value ? "invalid" : null;
}

export const AUTH_LINK_ERROR_COPY: Record<AuthLinkError, string> = {
  expired:
    "This link has expired or was already used. Request a new one and use it within an hour.",
  missing:
    "This link is missing its verification token. Request a new password reset.",
  invalid:
    "This link is invalid or has expired. Request a new one and use it within an hour.",
};

/** Supabase says "expired" or "invalid" for used and stale tokens alike. */
export function classifyVerifyError(message: string | undefined): AuthLinkError {
  return /expired|already|used|invalid/i.test(message ?? "")
    ? "expired"
    : "invalid";
}

/** Heading and button copy for the Continue page. */
export function continueCopy(type: EmailOtpType): {
  title: string;
  body: string;
  button: string;
} {
  if (type === "recovery") {
    return {
      title: "Reset your password",
      body: "Continue to choose a new password for your BlogIDE account.",
      button: "Continue",
    };
  }
  if (type === "email_change") {
    return {
      title: "Confirm your new email",
      body: "Continue to finish changing the email on your BlogIDE account.",
      button: "Confirm email",
    };
  }
  return {
    title: "Confirm your email",
    body: "Continue to finish signing in to BlogIDE.",
    button: "Continue",
  };
}
