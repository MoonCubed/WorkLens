import type { KeyboardEvent, ReactNode } from "react";
import { KpiInfo, type KPI_EXPLAINERS } from "./KpiInfo";

export function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  info,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "warning" | "serious";
  icon?: ReactNode;
  info?: keyof typeof KPI_EXPLAINERS;
  /** When set, the card becomes an activatable control that opens its drill-down. */
  onClick?: () => void;
}) {
  const toneStyles: Record<string, string> = {
    neutral: "text-ink",
    good: "text-[var(--status-good)]",
    warning: "text-[var(--status-warning)]",
    serious: "text-[var(--status-serious)]",
  };

  // A plain <button> can't wrap the KpiInfo popover trigger (nested buttons), so an
  // activatable card follows the app's div + role="button" pattern instead.
  const interactive = !!onClick;

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border border-border bg-surface p-5 shadow-sm ${
        interactive
          ? "cursor-pointer text-left transition-colors hover:border-brand-200 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          : ""
      }`}
      {...(interactive
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick!();
              }
            },
          }
        : {})}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-secondary uppercase tracking-wide">{label}</span>
        <span className="flex items-center gap-1.5 text-ink-muted">
          {icon}
          {info && <KpiInfo topic={info} />}
        </span>
      </div>
      <span className={`text-3xl font-semibold tabular ${toneStyles[tone]}`}>{value}</span>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </div>
  );
}
