"use client";

import { Logo } from "@/components/ui/Logo";
import { useSupervisorSession } from "@/store/session-store";

export function Topbar({
  role,
  personaName,
  personaTitle,
}: {
  role: "supervisor" | "employee";
  personaName?: string;
  personaTitle?: string;
}) {
  const name = personaName ?? "—";
  const title = personaTitle ?? "";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  return (
    <header className="h-16 flex items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-6">
      <div className="md:hidden">
        <Logo size={24} textClassName="text-[15px]" />
      </div>

      <div className="hidden md:block">
        {role === "supervisor" ? <SupervisorWorkspaceLabel /> : <p className="text-xs text-ink-muted">Employee workspace</p>}
      </div>

      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-full bg-brand-800 text-white text-xs font-semibold flex items-center justify-center shrink-0">
          {initials}
        </div>
        <div className="hidden sm:block leading-tight">
          <p className="text-sm font-medium text-ink">{name}</p>
          <p className="text-xs text-ink-muted">{title}</p>
        </div>
      </div>
    </header>
  );
}

function SupervisorWorkspaceLabel() {
  const { unit } = useSupervisorSession();
  return (
    <p className="text-xs text-ink-muted">
      Supervisor workspace · <span className="font-medium text-ink-secondary">{unit}</span>
    </p>
  );
}
