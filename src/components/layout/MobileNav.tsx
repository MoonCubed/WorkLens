"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EMPLOYEE_NAV, SUPERVISOR_NAV } from "./nav-config";

export function MobileNav({
  role,
  badges,
}: {
  role: "supervisor" | "employee";
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const items = role === "supervisor" ? SUPERVISOR_NAV : EMPLOYEE_NAV;

  return (
    <nav className="md:hidden sticky bottom-0 z-40 flex overflow-x-auto border-t border-border bg-surface">
      {items.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        const badge = badges?.[item.href] ?? 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex flex-1 min-w-[76px] flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium ${
              active ? "text-brand-700" : "text-ink-muted"
            }`}
          >
            <span className="relative">
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {badge > 0 && (
                <span
                  className="absolute -right-2 -top-1.5 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-semibold leading-none text-white"
                  aria-label={`${badge} pending`}
                >
                  {badge}
                </span>
              )}
            </span>
            <span className="text-center leading-tight">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
