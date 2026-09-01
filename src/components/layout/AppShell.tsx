import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Footer } from "./Footer";
import { MobileNav } from "./MobileNav";

export function AppShell({
  role,
  personaName,
  personaTitle,
  navBadges,
  children,
}: {
  role: "supervisor" | "employee";
  personaName?: string;
  personaTitle?: string;
  /** Per-nav-item pending counts, keyed by href. Only positive values render a badge. */
  navBadges?: Record<string, number>;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} badges={navBadges} />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar role={role} personaName={personaName} personaTitle={personaTitle} />
        <main className="flex-1 px-4 md:px-6 py-6 min-w-0">{children}</main>
        <Footer />
        <MobileNav role={role} badges={navBadges} />
      </div>
    </div>
  );
}
