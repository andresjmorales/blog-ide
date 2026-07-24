import Link from "next/link";
import { redirect } from "next/navigation";
import { GitHubFooter } from "@/components/GitHubFooter";
import {
  HOSTED_PRO_PRICE_LABEL,
  isHostedDeployment,
} from "@/lib/hosted";
import { PRODUCT_NAME } from "@/lib/brand";

const REPO_URL = "https://github.com/andresjmorales/blog-ide";

/**
 * Hosting options exist only on the hosted deploy (blogide.com).
 * Self-host installs redirect home; no marketing of paid/hosted tiers there.
 */
export default function HostingPage() {
  if (!isHostedDeployment()) {
    redirect("/");
  }

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="mb-10 w-full max-w-3xl text-center">
        <h1 className="mb-3 text-3xl font-semibold tracking-tight">
          Hosting options
        </h1>
        <p className="text-muted leading-relaxed">
          Run {PRODUCT_NAME} yourself, use the invite-only blogide.com instance,
          or (soon) a paid hosted plan with a higher storage quota.
        </p>
      </div>

      <div className="grid w-full max-w-4xl gap-4 md:grid-cols-3">
        <article className="flex flex-col rounded-lg border border-border bg-panel/40 p-5 text-left">
          <h2 className="mb-1 text-lg font-semibold">Self-host</h2>
          <p className="mb-3 text-sm font-medium text-accent">$0</p>
          <p className="mb-4 flex-1 text-sm text-muted leading-relaxed">
            Full product on your own Supabase + Next.js deploy. Your data, your
            keys, no BlogIDE subscription.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-accent underline underline-offset-4"
          >
            Setup on GitHub
          </a>
        </article>

        <article className="flex flex-col rounded-lg border border-border bg-panel/40 p-5 text-left">
          <h2 className="mb-1 text-lg font-semibold">Hosted invite</h2>
          <p className="mb-3 text-sm font-medium text-accent">$0 · beta code</p>
          <p className="mb-4 flex-1 text-sm text-muted leading-relaxed">
            blogide.com: we run it for you. Invite-only while the hosted
            instance is not open to the public. Default ~20 MiB combined quota
            (markdown + Storage).
          </p>
          <Link
            href="/signup"
            className="text-sm text-accent underline underline-offset-4"
          >
            Sign up with a beta code
          </Link>
        </article>

        <article className="flex flex-col rounded-lg border border-accent/50 bg-accent/5 p-5 text-left">
          <h2 className="mb-1 text-lg font-semibold">Hosted Pro</h2>
          <p className="mb-3 text-sm font-medium text-accent">
            ~{HOSTED_PRO_PRICE_LABEL} · coming soon
          </p>
          <p className="mb-4 flex-1 text-sm text-muted leading-relaxed">
            Higher storage quota on the hosted instance. Billing (Stripe) is not
            wired yet; this card is product framing only. You can always
            self-host or export instead.
          </p>
          <span className="text-sm text-muted">Waitlist / checkout TBD</span>
        </article>
      </div>

      <p className="mt-14 text-sm text-muted">
        <Link href="/" className="underline underline-offset-4 hover:text-foreground">
          ← Back home
        </Link>
      </p>

      <GitHubFooter />
    </main>
  );
}
