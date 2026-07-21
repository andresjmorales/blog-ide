import { Suspense } from "react";
import { ResetConfirmForm } from "@/components/ResetConfirmForm";

export const metadata = { title: "Choose a new password · BlogIDE" };

export default function ResetConfirmPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <Suspense>
        <ResetConfirmForm />
      </Suspense>
    </main>
  );
}
