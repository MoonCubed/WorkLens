import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";

export function SystemPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <main className="flex-1 px-4 md:px-6 py-6">
        <div className="mx-auto max-w-6xl space-y-6">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
