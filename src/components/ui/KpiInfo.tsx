"use client";

import { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";

export interface KpiExplainer {
  meaning: string;
  calculation: string;
  example: string;
}

export const KPI_EXPLAINERS: Record<string, KpiExplainer> = {
  teamMembers: {
    meaning: "Everyone currently recorded under this supervisor's unit in HR.",
    calculation: "Count of employees where Department = this unit",
    example: "6 employees in IT Service Support = 6 team members",
  },
  availableCapacity: {
    meaning: "Remaining working capacity across the whole team after accounting for each person's active workload.",
    calculation: "Sum across the team of (Weekly Working Hours − Active Remaining Work Hours)",
    example: "3 employees each with 8h available = 24h available, 20% of total capacity",
  },
  onLeave: {
    meaning: "Employees on approved leave today. Leave starting later shows under Attention Required.",
    calculation: "Count of employees with an approved leave event whose date range covers today",
    example: "2 employees with annual leave covering 26 Aug = 2 on leave",
  },
  openTickets: {
    meaning: "Tickets from the IT Ticket System assigned to this unit that aren't completed yet.",
    calculation: "Count of synced tickets where Assigned Unit = this unit and Status is not Completed",
    example: "5 in progress + 2 on hold = 7 open tickets",
  },
  overdueWork: {
    meaning: "Active work items — tickets and ad-hoc — whose due date has passed and aren't completed.",
    calculation: "Count of active work items where due date < today",
    example: "A ticket due 20 Aug, still open on 26 Aug → counts as overdue",
  },
  atRisk: {
    meaning: "Work items likely to miss their deadline given the current workload — due soon while the assignee is already heavily loaded, or owned by someone about to be on leave.",
    calculation: "Due-soon items where the assignee is at/above 80% utilized, plus active items owned by someone on or about to go on leave",
    example: "A ticket due in 3 days, assigned to someone at 88% utilization → At Risk",
  },
  utilization: {
    meaning: "Measures the percentage of an employee's available working capacity currently committed to active (not completed) work, adjusted for logged progress.",
    calculation: "Remaining Work Hours ÷ Weekly Working Hours × 100",
    example: "32 remaining hours ÷ 40 weekly hours = 80% utilization",
  },
};

export function KpiInfo({ topic }: { topic: keyof typeof KPI_EXPLAINERS }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const explainer = KPI_EXPLAINERS[topic];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="What does this mean?"
        className="text-ink-muted hover:text-brand-600"
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-border bg-surface p-4 text-left shadow-lg">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">What it means</p>
          <p className="mt-1 text-xs leading-relaxed text-ink">{explainer.meaning}</p>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">How it&rsquo;s calculated</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-secondary font-mono">{explainer.calculation}</p>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Example</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{explainer.example}</p>
        </div>
      )}
    </div>
  );
}
