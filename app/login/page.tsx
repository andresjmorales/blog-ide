import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";
import { GitHubFooter } from "@/components/GitHubFooter";

export const metadata = { title: "Sign in · BlogIDE" };

export default function LoginPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
      <Suspense>
        <LoginForm />
      </Suspense>
      <GitHubFooter />
    </main>
  );
}
