"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, PauseCircle } from "lucide-react";
import type { Employee } from "@/data/types";
import { useTickets } from "@/store/tickets-store";
import { useWorkLog } from "@/store/work-log-store";
import { computeEmployeeSchedule, type EmployeeDayPlan } from "@/lib/capacityEngine";
import { todayStart, startOfWeek, weekOfYear, weekRangeLabel } from "@/lib/date";

/**
 * What an employee needs to work on each day of the **current week**, generated
 * straight from the shared task schedule (`computeEmployeeSchedule`) — no separate
 * hand-maintained plan. Each task's estimated hours are spread evenly across its
 * working days until its deadline, so a day's list and totals move the moment a
 * deadline, estimate, status or availability changes.
 *
 * Only the current Sunday-based week is shown (never future weeks); the employee moves
 * between its working days with ← / →.
 */
export function DailyTasks({
  employee,
  onOpenTicket,
}: {
  employee: Employee;
  onOpenTicket?: (ticketId: string) => void;
}) {
  const { tickets } = useTickets();
  const { getEntry } = useWorkLog();

  const { plans, onHold, weekLabel, todayIndex } = useMemo(() => {
    const weekStart = startOfWeek(todayStart());
    const schedule = computeEmployeeSchedule(employee, tickets, getEntry);
    // The working days of the current week only (Sun–Thu) — planForRange stops at 5.
    const weekPlans = schedule.planForRange(weekStart, 5);
    const idx = weekPlans.findIndex((p) => p.isToday);
    return {
      plans: weekPlans,
      onHold: schedule.items.filter((i) => i.status === "On Hold"),
      weekLabel: `Week ${weekOfYear(weekStart)} · ${weekRangeLabel(weekStart)}`,
      // Start on today; on the weekend the week's last working day (Thu).
      todayIndex: idx >= 0 ? idx : Math.max(0, weekPlans.length - 1),
    };
  }, [employee, tickets, getEntry]);

  const [dayOffset, setDayOffset] = useState<number | null>(null);
  const idx = Math.min(Math.max(0, dayOffset ?? todayIndex), Math.max(0, plans.length - 1));

  if (plans.length === 0) {
    return (
      <div>
        <p className="mb-2 text-xs font-medium text-ink-secondary">{weekLabel}</p>
        <p className="text-sm text-ink-muted py-4">No working days this week.</p>
      </div>
    );
  }

  const plan = plans[idx];
  const dayLabel = `${plan.weekdayLabel}, ${plan.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium text-ink-secondary">{weekLabel}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDayOffset(idx - 1)}
            disabled={idx === 0}
            className="rounded-lg border border-border-strong bg-surface p-1.5 text-ink-secondary hover:bg-brand-50 disabled:opacity-40"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[8rem] text-center text-sm font-medium text-ink">
            {plan.isToday ? "Today" : dayLabel}
          </span>
          <button
            onClick={() => setDayOffset(idx + 1)}
            disabled={idx === plans.length - 1}
            className="rounded-lg border border-border-strong bg-surface p-1.5 text-ink-secondary hover:bg-brand-50 disabled:opacity-40"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <DayCard plan={plan} onOpenTicket={onOpenTicket} />

      {onHold.length > 0 && (
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
  const isPast = plan.date.getTime() < todayStart().getTime();

  return (
    <div className={`rounded-lg border p-3.5 ${plan.isToday ? "border-brand-500 bg-brand-50/40" : "border-border"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <CalendarDays className={`h-4 w-4 ${plan.isToday ? "text-brand-700" : "text-ink-muted"}`} />
          {plan.isToday ? "Today" : plan.weekdayLabel} <span className="font-normal text-ink-muted">— {dateLabel}</span>
        </p>
        <span className="tabular text-xs font-medium text-ink-secondary">
          {plan.onLeave
            ? "On leave"
            : plan.allocations.length === 0
              ? "Nothing planned"
              : `Total planned: ${plan.totalHours}h`}
        </span>
      </div>

      {plan.allocations.length === 0 && !plan.onLeave && isPast && (
        <p className="mt-2 text-xs text-ink-muted">This day has passed. Anything unfinished is rescheduled onto the days ahead.</p>
      )}

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
                <span className="min-w-0 truncate text-ink">
                  {item.title}
                  {item.remainingHours > hours + 0.05 && (
                    <span className="ml-1.5 text-[11px] text-ink-muted">· {formatHours(item.remainingHours)}h left total</span>
                  )}
                </span>
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
