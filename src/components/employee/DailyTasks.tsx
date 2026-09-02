"use client";

import { useMemo } from "react";
import { CalendarDays, PauseCircle } from "lucide-react";
import type { Employee } from "@/data/types";
import { useTickets } from "@/store/tickets-store";
import { useWorkLog } from "@/store/work-log-store";
import { computeEmployeeSchedule, type EmployeeDayPlan } from "@/lib/capacityEngine";
import { todayStart } from "@/lib/date";

/**
 * What an employee needs to work on each day, generated straight from the shared task
 * schedule (`computeEmployeeSchedule`) — no separate hand-maintained plan. Each task's
 * estimated hours are spread evenly across its working days until its deadline, so a
 * day's list and totals move the moment a deadline, estimate, status or availability
 * changes.
 */
export function DailyTasks({
  employee,
  workingDays = 10,
  todayOnly = false,
  onOpenTicket,
}: {
  employee: Employee;
  /** How many working days to show (ignored when `todayOnly`). */
  workingDays?: number;
  todayOnly?: boolean;
  onOpenTicket?: (ticketId: string) => void;
}) {
  const { tickets } = useTickets();
  const { getEntry } = useWorkLog();

  const { plans, onHold } = useMemo(() => {
    const schedule = computeEmployeeSchedule(employee, tickets, getEntry);
    return {
      plans: schedule.planForRange(todayStart(), todayOnly ? 1 : workingDays),
      // On-hold work carried by this employee — context only; it isn't scheduled and
      // doesn't count toward a day's planned hours.
      onHold: schedule.items.filter((i) => i.status === "On Hold"),
    };
  }, [employee, tickets, getEntry, workingDays, todayOnly]);

  if (plans.length === 0) {
    return <p className="text-sm text-ink-muted py-4">No working days scheduled in this window.</p>;
  }

  return (
    <div className="space-y-4">
      {plans.map((plan) => (
        <DayCard key={plan.key} plan={plan} onOpenTicket={onOpenTicket} />
      ))}

      {todayOnly && onHold.length > 0 && (
        <div className="rounded-lg border border-border bg-brand-50/40 p-3 text-xs text-ink-secondary">
          <p className="flex items-center gap-1.5 font-medium text-ink-secondary">
            <PauseCircle className="h-3.5 w-3.5" />
            On hold — not scheduled
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {onHold.map((i) => (
              <li key={i.key} className="truncate">{i.title}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DayCard({ plan, onOpenTicket }: { plan: EmployeeDayPlan; onOpenTicket?: (ticketId: string) => void }) {
  const dateLabel = plan.date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className={`rounded-lg border p-3.5 ${plan.isToday ? "border-brand-500 bg-brand-50/40" : "border-border"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <CalendarDays className={`h-4 w-4 ${plan.isToday ? "text-brand-700" : "text-ink-muted"}`} />
          {plan.isToday ? "Today" : plan.weekdayLabel} <span className="font-normal text-ink-muted">— {dateLabel}</span>
        </p>
        <span className="tabular text-xs font-medium text-ink-secondary">
          {plan.allocations.length === 0 ? "Nothing planned" : `Total planned: ${plan.totalHours}h`}
        </span>
      </div>

      {plan.allocations.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {plan.allocations
            .slice()
            .sort((a, b) => b.hours - a.hours)
            .map(({ item, hours }) => (
              <li
                key={item.key}
                onClick={item.ticketId && onOpenTicket ? () => onOpenTicket(item.ticketId!) : undefined}
                className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs ${
                  item.ticketId && onOpenTicket ? "cursor-pointer hover:bg-brand-50/70" : ""
                }`}
              >
                <span className="min-w-0 truncate text-ink">{item.title}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular font-medium text-ink">{formatHours(hours)}h</span>
                  <span
                    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                      item.overdue
                        ? "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical)]"
                        : "border-brand-100 bg-brand-50 text-brand-700"
                    }`}
                  >
                    {item.overdue ? "Overdue" : "In Progress"}
                  </span>
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function formatHours(h: number): string {
  return (Math.round(h * 10) / 10).toString();
}
