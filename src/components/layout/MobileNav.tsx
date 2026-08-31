"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EMPLOYEE_NAV, SUPERVISOR_NAV } from "./nav-config";

export function MobileNav({ role }: { role: "supervisor" | "employee" }) {
  const pathname = usePathname();
  const items = role === "supervisor" ? SUPERVISOR_NAV : EMPLOYEE_NAV;

  return (
    <nav className="md:hidden sticky bottom-0 z-40 flex overflow-x-auto border-t border-border bg-surface">
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 min-w-[76px] flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium ${
              active ? "text-brand-700" : "text-ink-muted"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            <span className="text-center leading-tight">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
