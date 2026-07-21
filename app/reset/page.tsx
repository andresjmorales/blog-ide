import { ResetRequestForm } from "@/components/ResetRequestForm";

export const metadata = { title: "Reset password · BlogIDE" };

export default function ResetPage() {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <ResetRequestForm />
    </main>
  );
}
