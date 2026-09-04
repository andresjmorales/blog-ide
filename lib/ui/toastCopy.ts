/**
 * Turn thrown values into toast copy. Human-written app errors stay as-is.
 * Stacks, JSON dumps, and engine messages become "Something went wrong"
 * with expandable details.
 */

export type ToastCopy = {
  message: string;
  detail?: string;
  technical: boolean;
};

const HUMAN_START =
  /^(could not|couldn't|cannot|can’t|this |that |the |your |zotero|github|pandoc|export|import|storage|sign in|you appear|already |no |enter |quota|nothing |blogide|reader |preview |print |word |pdf |pushbullet|ntfy)/i;

function rawFromUnknown(error: unknown): string {
  if (typeof error === "string") return error.trim();
  if (error instanceof Error) return error.message.trim();
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") return message.trim();
  }
  return "";
}

export function looksTechnicalError(text: string): boolean {
  const value = text.trim();
  if (!value) return true;
  if (value.length > 220) return true;
  if (/^\s*[{[]/.test(value)) return true;
  if (value.includes("\n    at ")) return true;
  if (/^(failed to fetch|network request failed|load failed)$/i.test(value)) {
    return true;
  }
  if (
    /\b(typeerror|referenceerror|syntaxerror|evalerror|urierror|pgrst\d+|econn|enotfound|errno)\b/i.test(
      value
    )
  ) {
    return true;
  }
  if (/^[A-Za-z]*Error:/.test(value) && !HUMAN_START.test(value)) {
    return true;
  }
  if (/at\s+\S+\s+\([^)]+:\d+:\d+\)/.test(value)) return true;
  return false;
}

function isEngineError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError ||
    error instanceof EvalError ||
    error instanceof URIError
  );
}

export function toastCopyFromError(
  error: unknown,
  fallback = "Something went wrong"
): ToastCopy {
  const raw = rawFromUnknown(error);
  if (isEngineError(error)) {
    return {
      message: fallback,
      detail: raw || (error instanceof Error ? error.name : undefined),
      technical: true,
    };
  }
  if (!raw) {
    return { message: fallback, technical: true };
  }
  if (looksTechnicalError(raw)) {
    return { message: fallback, detail: raw, technical: true };
  }
  if (!HUMAN_START.test(raw) && raw.length > 140) {
    return { message: fallback, detail: raw, technical: true };
  }
  return { message: raw, technical: false };
}
