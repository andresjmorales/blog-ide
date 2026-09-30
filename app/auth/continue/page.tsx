import Link from "next/link";
import { continueCopy, isEmailOtpType } from "@/lib/auth/confirmLink";
import { safeNextPath } from "@/lib/siteUrl";

export const metadata = { title: "Continue · BlogIDE" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Human step between an auth email link and spending its one-time token.
 * Scanners that prefetch the link only ever see this page.
 */
export default async function AuthContinuePage({ searchParams }: Props) {
  const params = await searchParams;
  const tokenHash = one(params.token_hash);
  const type = one(params.type);
  const next = safeNextPath(one(params.next), "/reset/confirm");

  if (!tokenHash || !isEmailOtpType(type)) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-4 text-2xl font-semibold">Link incomplete</h1>
          <p className="text-sm text-muted">
            This link is missing its verification token. Request a new one.
          </p>
          <p className="mt-6 text-sm">
            <Link href="/reset" className="text-accent underline underline-offset-4">
              Request a new link
            </Link>
          </p>
        </div>
      </main>
    );
  }

  const copy = continueCopy(type);
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <form method="post" action="/auth/confirm" className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-semibold">{copy.title}</h1>
        <p className="mb-8 text-sm text-muted">{copy.body}</p>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          {copy.button}
        </button>
      </form>
    </main>
  );
}
