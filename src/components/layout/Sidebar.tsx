"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Home } from "lucide-react";
import { EMPLOYEE_NAV, SUPERVISOR_NAV } from "./nav-config";
import { Logo } from "@/components/ui/Logo";

export function Sidebar({ role }: { role: "supervisor" | "employee" }) {
  const pathname = usePathname();
  const items = role === "supervisor" ? SUPERVISOR_NAV : EMPLOYEE_NAV;

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-surface border-r border-border sticky top-0 h-screen">
      <div className="h-16 flex items-center px-5 border-b border-border">
        <Link href={role === "supervisor" ? "/supervisor" : "/employee"}>
          <Logo size={26} textClassName="text-[15px]" />
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        <div>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {role === "supervisor" ? "Supervisor" : "My Workspace"}
          </p>
          <div className="space-y-0.5">
            {items.map((item) => (
              <NavLink key={item.href} item={item} active={pathname === item.href} />
            ))}
          </div>
        </div>
      </nav>

      <div className="px-3 py-4 border-t border-border space-y-0.5">
        <Link
          href="/worklens"
          className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-ink-muted hover:bg-brand-50/60 hover:text-ink-secondary"
        >
          <Home className="h-3.5 w-3.5" />
          Homepage
        </Link>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-ink-muted hover:bg-brand-50/60 hover:text-ink-secondary"
        >
          <Building2 className="h-3.5 w-3.5" />
          Enterprise Systems
        </Link>
        <p className="px-2 pt-1.5 text-[11px] font-medium leading-relaxed text-ink-muted">All tasks in sight.</p>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  active,
}: {
  item: { label: string; href: string; icon: (typeof SUPERVISOR_NAV)[number]["icon"] };
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-brand-50 text-brand-700"
          : "text-ink-secondary hover:bg-brand-50/60 hover:text-ink"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      {item.label}
    </Link>
  );
}
