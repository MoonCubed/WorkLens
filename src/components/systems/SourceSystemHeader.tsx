"use client";

import { useState, type ReactNode } from "react";
import type { SourceSystem } from "@/data/systems";
import { nowLabel } from "@/lib/date";

const ACCENT_BAR: Record<SourceSystem["accent"], string> = {
  amber: "bg-[var(--status-warning)]",
  teal: "bg-accent-teal",
};

export function SourceSystemHeader({
  system,
  actions,
}: {
  system: Pick<SourceSystem, "name" | "subtitle" | "accent">;
  actions?: ReactNode;
}) {
  // A live "just synced" stamp rather than a frozen demo timestamp.
  const [syncedAt] = useState(() => nowLabel());
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className={`h-1 w-full ${ACCENT_BAR[system.accent]}`} />
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">External System</p>
              <h1 className="mt-0.5 text-2xl font-semibold text-ink tracking-tight">{system.name}</h1>
              <p className="mt-0.5 text-sm text-ink-secondary">{system.subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-2.5 py-1 text-xs font-medium text-[var(--status-good)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-good)]" />
                Connected
              </span>
              {actions}
            </div>
          </div>

          <p className="mt-4 text-right text-xs text-ink-muted">Last synchronized: {syncedAt}</p>
        </div>
      </div>
    </div>
  );
}

export function SourceSystemNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-border-strong bg-brand-50/60 px-4 py-2.5 text-xs text-ink-muted">
      {children}
    </p>
  );
}
