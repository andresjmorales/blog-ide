import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Connection troubleshooting · ${PRODUCT_NAME}`,
  description:
    "What to try when BlogIDE can’t reach the cloud from a work laptop or locked-down network.",
};

export default function ConnectionHelpPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-12">
      <p className="mb-3 font-mono text-xs uppercase tracking-widest text-muted">
        Help
      </p>
      <h1 className="mb-4 text-3xl font-semibold tracking-tight">
        Can’t connect to the cloud
      </h1>
      <p className="mb-8 text-base leading-relaxed text-muted">
        BlogIDE’s editor loads from <strong className="text-foreground">blogide.com</strong>,
        but your files sync through a separate cloud API (
        <code className="text-foreground">*.supabase.co</code>). If that second
        connection is blocked or broken by a work network, you’ll see a
        connection error even though the website itself loads fine.
      </p>

      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">Try this first</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
          <li>
            <span className="text-foreground">Phone hotspot</span>: same
            laptop, no office Wi-Fi or VPN. If BlogIDE works there, the office
            network is filtering the sync API.
          </li>
          <li>
            <span className="text-foreground">Disable VPN</span> (or try
            enabling one: some VPNs fix captive filters; others break TLS).
          </li>
          <li>
            <span className="text-foreground">Another browser / private window</span>{" "}
            with extensions off.
          </li>
          <li>
            <span className="text-foreground">Sign out, then sign in</span>, and
            hard-reload the editor.
          </li>
        </ol>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">Why work laptops break this</h2>
        <p className="text-sm leading-relaxed text-muted">
          Many corporate networks use HTTPS inspection or strict certificate
          revocation checks. Tools on Windows often surface errors like{" "}
          <code className="text-foreground">CRYPT_E_NO_REVOCATION_CHECK</code>{" "}
          when they can’t reach OCSP/CRL servers. Ordinary sites may still
          work; BlogIDE’s sync host is a third-party API with its own
          certificate chain, so it gets caught more often.
        </p>
        <p className="text-sm leading-relaxed text-muted">
          “It worked this morning” usually means an IT policy, proxy, VPN, or
          Windows update changed, not that your account was deleted.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-lg font-semibold">Ask IT to allowlist</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
          <li>
            Allow outbound HTTPS to{" "}
            <code className="text-foreground">*.supabase.co</code>
          </li>
          <li>
            Prefer <span className="text-foreground">no SSL inspection</span>{" "}
            for that host (or ensure revocation checks can complete)
          </li>
          <li>
            Confirm WebSockets / long-lived HTTPS aren’t stripped for that
            domain
          </li>
        </ul>
        <p className="text-sm leading-relaxed text-muted">
          Quick check from the same machine (PowerShell or terminal):
        </p>
        <pre className="overflow-x-auto rounded-md border border-border bg-panel p-3 text-xs text-foreground">
          {`curl -I https://YOUR_PROJECT.supabase.co/auth/v1/health`}
        </pre>
        <p className="text-sm leading-relaxed text-muted">
          A clean response means the path is open. Certificate / revocation /
          timeout errors point at the network stack, not BlogIDE itself.
        </p>
      </section>

      <section className="mb-10 space-y-3">
        <h2 className="text-lg font-semibold">Self-hosters</h2>
        <p className="text-sm leading-relaxed text-muted">
          If you run BlogIDE yourself, also confirm{" "}
          <code className="text-foreground">NEXT_PUBLIC_SUPABASE_URL</code> is{" "}
          <code className="text-foreground">https://…</code> (never{" "}
          <code className="text-foreground">http://</code> on an HTTPS site)
          and that <code className="text-foreground">supabase/schema.sql</code>{" "}
          has been applied. See the repo README and{" "}
          <Link href="/hosting" className="text-accent underline underline-offset-4">
            hosting options
          </Link>
          .
        </p>
      </section>

      <p className="text-sm text-muted">
        <Link href="/editor" className="text-accent underline underline-offset-4">
          Back to the editor
        </Link>
        {" · "}
        <Link href="/" className="text-accent underline underline-offset-4">
          Home
        </Link>
      </p>
    </main>
  );
}
