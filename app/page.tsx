import Link from "next/link";
import { BetaCodeForm } from "@/components/BetaCodeForm";

export default function LandingPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl text-center">
        <p className="text-sm font-mono uppercase tracking-widest text-muted mb-4">
          Private beta
        </p>
        <h1 className="text-5xl font-semibold tracking-tight mb-4">BlogIDE</h1>
        <p className="text-lg text-muted mb-10 leading-relaxed">
          An IDE for essays: a cross between a rich WYSIWYG editor and a second
          brain, with first-class footnotes, autosave, a project-style
          workspace, and optional AI. Markdown-native, local-first, and yours
          to keep.
        </p>

        <BetaCodeForm />

        <p className="mt-8 text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>

      <footer className="mt-16 text-xs text-muted">
        MIT licensed · self-hostable ·{" "}
        <a
          href="https://github.com/moralesq/blog-ide"
          className="underline underline-offset-4"
        >
          source
        </a>
      </footer>
    </main>
  );
}
