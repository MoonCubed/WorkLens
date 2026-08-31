import { getCapacityStatus } from "@/lib/capacity";

export function StatusBadge({ utilization, label }: { utilization: number; label?: string }) {
  const status = getCapacityStatus(utilization);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${status.bg} ${status.border} ${status.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden />
      {label ?? status.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: "High" | "Medium" | "Low" }) {
  const styles: Record<string, string> = {
    High: "bg-[var(--status-critical-bg)] border-[var(--status-critical-border)] text-[var(--status-critical)]",
    Medium: "bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning)]",
    Low: "bg-brand-50 border-border-strong text-ink-secondary",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${styles[priority]}`}>
      {priority}
    </span>
  );
}
