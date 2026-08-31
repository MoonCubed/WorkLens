import type { ReactNode } from "react";

/** A polished browser-window chrome used to frame product-preview mockups on the
 * marketing landing page — keeps every preview visually consistent. */
export function BrowserFrame({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-brand-950/10">
      <div className="flex items-center gap-3 border-b border-border bg-page px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-critical)]/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-warning)]/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-good)]/60" />
        </div>
        {label && (
          <div className="flex-1 truncate rounded-md bg-surface px-3 py-1 text-center text-[11px] text-ink-muted border border-border">
            {label}
          </div>
        )}
      </div>
      <div className="bg-page p-5">{children}</div>
    </div>
  );
}
