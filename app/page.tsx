import Link from "next/link";
import { BetaCodeForm } from "@/components/BetaCodeForm";
import { GitHubFooter } from "@/components/GitHubFooter";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "@/lib/brand";
import { isHostedDeployment } from "@/lib/hosted";

export default function LandingPage() {
  const hosted = isHostedDeployment();

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-xl text-center">
        <p className="mb-4 font-mono text-sm uppercase tracking-widest text-muted">
          {hosted ? "Hosted instance" : "Self-hostable"}
        </p>
        <h1 className="mb-4 text-5xl font-semibold tracking-tight">
          {PRODUCT_NAME}
        </h1>
        <p className="mb-6 text-lg leading-relaxed text-muted">
          {PRODUCT_DESCRIPTION}
        </p>

        {hosted ? (
          <p className="mb-10 text-sm leading-relaxed text-muted">
            This is the{" "}
            <span className="text-foreground">blogide.com</span> hosted
            instance — invite-only for now, not open public signup. Prefer to
            run it yourself?{" "}
            <Link
              href="/hosting"
              className="text-accent underline underline-offset-4"
            >
              Hosting options
            </Link>
            .
          </p>
        ) : (
          <p className="mb-10 text-sm leading-relaxed text-muted">
            You&apos;re on a self-hosted (or local) install — full product, no
            hosted paywall. Compare deploy choices on{" "}
            <Link
              href="/hosting"
              className="text-accent underline underline-offset-4"
            >
              Hosting options
            </Link>
            .
          </p>
        )}

        {hosted ? (
          <BetaCodeForm />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Link
              href="/editor"
              className="inline-flex rounded border border-accent bg-accent/10 px-5 py-2.5 text-sm font-medium text-accent hover:bg-accent/20"
            >
              Open editor
            </Link>
            <p className="text-sm text-muted">
              Or{" "}
              <Link
                href="/signup"
                className="text-accent underline underline-offset-4"
              >
                create an account
              </Link>{" "}
              if this install uses Supabase auth.
            </p>
          </div>
        )}

        <p className="mt-8 text-sm text-muted">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-accent underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>

      <section className="mt-16 w-full max-w-2xl border-t border-border pt-10 text-center">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
          Screenshots
        </h2>
        <p className="text-sm text-muted">
          Product screenshots coming soon — a place for the editor, pins, and
          Library once assets are ready.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="flex h-36 items-center justify-center rounded border border-dashed border-border bg-panel text-xs text-muted">
            Editor preview
          </div>
          <div className="flex h-36 items-center justify-center rounded border border-dashed border-border bg-panel text-xs text-muted">
            Research pins
          </div>
        </div>
      </section>

      <GitHubFooter showHostingLink />
    </main>
  );
}
