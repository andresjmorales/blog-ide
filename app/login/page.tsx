import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export const metadata = { title: "Sign in · BlogIDE" };

export default function LoginPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
