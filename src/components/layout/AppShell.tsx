import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Footer } from "./Footer";
import { MobileNav } from "./MobileNav";

export function AppShell({
  role,
  personaName,
  personaTitle,
  children,
}: {
  role: "supervisor" | "employee";
  personaName?: string;
  personaTitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar role={role} personaName={personaName} personaTitle={personaTitle} />
        <main className="flex-1 px-4 md:px-6 py-6 min-w-0">{children}</main>
        <Footer />
        <MobileNav role={role} />
      </div>
    </div>
  );
}
