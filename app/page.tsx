import Link from "next/link";
import { BetaCodeForm } from "@/components/BetaCodeForm";
import { GitHubFooter } from "@/components/GitHubFooter";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "@/lib/brand";

export default function LandingPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl text-center">
        <p className="text-sm font-mono uppercase tracking-widest text-muted mb-4">
          Private beta
        </p>
        <h1 className="text-5xl font-semibold tracking-tight mb-4">
          {PRODUCT_NAME}
        </h1>
        <p className="text-lg text-muted mb-10 leading-relaxed">
          {PRODUCT_DESCRIPTION}
        </p>

        <BetaCodeForm />

        <p className="mt-8 text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>

      <GitHubFooter />
    </main>
  );
}
