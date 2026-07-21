import { Suspense } from "react";
import { SignupForm } from "@/components/SignupForm";
import { GitHubFooter } from "@/components/GitHubFooter";

export const metadata = { title: "Sign up · BlogIDE" };

export default function SignupPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
      <Suspense>
        <SignupForm />
      </Suspense>
      <GitHubFooter />
    </main>
  );
}
