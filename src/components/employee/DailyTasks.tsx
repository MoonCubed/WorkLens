"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CalendarClock, ChevronLeft, ChevronRight, PauseCircle, Sparkles, RotateCcw } from "lucide-react";
import type { Employee } from "@/data/types";
import { useTickets } from "@/store/tickets-store";
import { useWorkLog } from "@/store/work-log-store";
import { useCalendarEvents } from "@/store/calendar-events-store";
import { useDayPlans } from "@/store/day-plans-store";
import { computeEmployeeSchedule, type EmployeeDayPlan } from "@/lib/capacityEngine";
import { todayStart, startOfWeek, addDays, isWorkingDay, weekOfYear, weekRangeLabel, relativeDayLabel } from "@/lib/date";

/**
 * What an employee is scheduled to work on, day by day — generated straight from the
 * shared task schedule (`computeEmployeeSchedule`), so a day's list and totals move
 * the moment a deadline, estimate, remaining effort, status, calendar event or
 * availability changes. Nothing is invented for days with no scheduled work.
 *
 * The employee moves between days with ← / → and between weeks with the week arrows,
 * forward into future scheduled weeks as far as they like. If they've run Plan My Day
 * for the selected day, that confirmed plan is shown instead of the even spread.
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
  const { events } = useCalendarEvents();
  const { getPlan, clearPlan } = useDayPlans();

  // A day cursor, snapped to working days (Sun–Thu). Starts on today, or the coming
  // Sunday on a weekend.
  const [cursor, setCursor] = useState<Date>(() => {
    let d = todayStart();
    while (!isWorkingDay(d)) d = addDays(d, 1);
    return d;
  });

  const { schedule, onHold } = useMemo(() => {
    const s = computeEmployeeSchedule(employee, tickets, getEntry, events);
    return { schedule: s, onHold: s.items.filter((i) => i.heldNow) };
  }, [employee, tickets, getEntry, events]);

  const plan = useMemo(() => schedule.planForRange(cursor, 1)[0] ?? null, [schedule, cursor]);
  const weekStart = startOfWeek(cursor);
  const weekLabel = `Week ${weekOfYear(weekStart)} · ${weekRangeLabel(weekStart)}`;

  const savedPlan = plan ? getPlan(employee.id, plan.key) : null;

  function stepDay(dir: 1 | -1) {
    setCursor((c) => {
      let d = addDays(c, dir);
      while (!isWorkingDay(d)) d = addDays(d, dir);
      return d;
    });
  }
  function stepWeek(dir: 1 | -1) {
    setCursor((c) => {
      let d = addDays(c, dir * 7);
      while (!isWorkingDay(d)) d = addDays(d, dir);
      return d;
    });
  }

  const isThisWeek = weekStart.getTime() === startOfWeek(todayStart()).getTime();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => stepWeek(-1)}
            className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-xs font-medium text-ink-secondary hover:bg-brand-50"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <p className="text-xs font-medium text-ink-secondary">
            {weekLabel}
            {isThisWeek && <span className="ml-1.5 text-ink-muted">· this week</span>}
          </p>
          <button
            onClick={() => stepWeek(1)}
            className="rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-xs font-medium text-ink-secondary hover:bg-brand-50"
            aria-label="Next week"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => stepDay(-1)}
            className="rounded-lg border border-border-strong bg-surface p-1.5 text-ink-secondary hover:bg-brand-50"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-medium text-ink">
            {plan?.isToday
              ? "Today"
              : cursor.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </span>
          <button
            onClick={() => stepDay(1)}
            className="rounded-lg border border-border-strong bg-surface p-1.5 text-ink-secondary hover:bg-brand-50"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {plan ? (
        <DayCard
          plan={plan}
          savedPlan={
            savedPlan
              ? {
                  rows: savedPlan.allocations,
                  createdAt: savedPlan.createdAt,
                  onReset: () => clearPlan(employee.id, plan.key).catch(() => {}),
                }
              : null
          }
          onOpenTicket={onOpenTicket}
        />
      ) : (
        <p className="py-4 text-sm text-ink-muted">Nothing to show for this day.</p>
      )}

      {onHold.length > 0 && (
        <div className="rounded-lg border border-border bg-brand-50/40 p-3 text-xs text-ink-secondary">
          <p className="flex items-center gap-1.5 font-medium text-ink-secondary">
            <PauseCircle className="h-3.5 w-3.5" />
            On Hold — paused until the hold ends
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {onHold.map((i) => (
              <li key={i.key} className="truncate">
                {i.title}
                {i.resumesOn && <span className="text-ink-muted"> — resumes {i.resumesOn}</span>}
                {i.deadlineUnreachable && (
                  <span className="text-[var(--status-critical)]"> — deadline is before it can resume</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface SavedPlanView {
  rows: { key: string; title: string; hours: number; status: string; ticketId?: string | null; reason?: string }[];
  createdAt: string;
  onReset: () => void;
}

function DayCard({
  plan,
  savedPlan,
  onOpenTicket,
}: {
  plan: EmployeeDayPlan;
  savedPlan: SavedPlanView | null;
  onOpenTicket?: (ticketId: string) => void;
}) {
  const dateLabel = plan.date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const isPast = plan.date.getTime() < todayStart().getTime();
  const scheduled = plan.allocations
    .slice()
    .sort((a, b) => b.hours - a.hours);

  return (
    <div className={`rounded-lg border p-3.5 ${plan.isToday ? "border-brand-500 bg-brand-50/40" : "border-border"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <CalendarDays className={`h-4 w-4 ${plan.isToday ? "text-brand-700" : "text-ink-muted"}`} />
          {plan.isToday ? "Today" : plan.weekdayLabel} <span className="font-normal text-ink-muted">— {dateLabel}</span>
        </p>
        <span className="tabular text-xs font-medium text-ink-secondary">
          {plan.onLeave
            ? "On leave"
            : plan.allocations.length === 0
              ? "Nothing scheduled"
              : `Planned: ${plan.totalHours}h · ${plan.availableHours}h available`}
        </span>
      </div>

      {/* Employee calendar events — distinct from tasks and from leave. */}
      {plan.calendarEvents.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {plan.calendarEvents.map((ev) => (
            <li
              key={ev.id}
              className="flex items-center justify-between gap-3 rounded-md border border-purple-200 bg-purple-50 px-2 py-1.5 text-xs text-purple-900"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{ev.title}</span>
              </span>
              <span className="shrink-0 tabular font-medium">
                {ev.startTime}–{ev.endTime}
              </span>
            </li>
          ))}
        </ul>
      )}

      {savedPlan ? (
        <div className="mt-2.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
              <Sparkles className="h-3 w-3" />
              Your plan for this day
              {relativeDayLabel(savedPlan.createdAt) && (
                <span className="text-brand-500">· set {relativeDayLabel(savedPlan.createdAt)?.toLowerCase()}</span>
              )}
            </span>
            <button
              onClick={savedPlan.onReset}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted hover:text-ink"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to auto
            </button>
          </div>
          <ul className="space-y-1.5">
            {savedPlan.rows.map((r) => (
              <li
                key={r.key}
                onClick={r.ticketId && onOpenTicket ? () => onOpenTicket(r.ticketId!) : undefined}
                className={`rounded-md px-2 py-1.5 text-xs ${r.ticketId && onOpenTicket ? "cursor-pointer hover:bg-brand-50/70" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-ink">{r.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular font-medium text-ink">{r.hours}h</span>
                    <StatusChip label={r.status} />
                  </span>
                </div>
                {r.reason && <p className="mt-0.5 text-[11px] text-ink-muted">{r.reason}</p>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          {plan.allocations.length === 0 && !plan.onLeave && isPast && (
            <p className="mt-2 text-xs text-ink-muted">
              This day has passed. Anything unfinished is rescheduled onto the days ahead.
            </p>
          )}
          {scheduled.length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {scheduled.map(({ item, hours }) => (
                <li
                  key={item.key}
                  onClick={item.ticketId && onOpenTicket ? () => onOpenTicket(item.ticketId!) : undefined}
                  className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs ${
                    item.ticketId && onOpenTicket ? "cursor-pointer hover:bg-brand-50/70" : ""
                  }`}
                >
                  <span className="min-w-0 truncate text-ink">
                    {item.title}
                    {item.isCoverage && (
                      <span className="ml-1.5 text-[11px] text-[color:var(--accent-teal)]">· covering {item.coverageOwnerName?.split(" ")[0]}</span>
                    )}
                    <span className="ml-1.5 text-[11px] text-ink-muted">
                      · due {item.deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    {item.resumedFromHold && <span className="ml-1.5 text-[11px] text-brand-700">· resumed after hold</span>}
                    {item.remainingOverridden && (
                      <span className="ml-1.5 text-[11px] text-ink-muted">· remaining updated</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular font-medium text-ink">{fmt(hours)}h</span>
                    <StatusChip
                      label={item.overdue ? "Overdue" : item.deadlineUnreachable ? "Deadline risk" : "In Progress"}
                      critical={item.overdue || item.deadlineUnreachable}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function StatusChip({ label, critical }: { label: string; critical?: boolean }) {
  const isCritical = critical ?? /overdue|risk/i.test(label);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
        isCritical
          ? "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical)]"
          : "border-brand-100 bg-brand-50 text-brand-700"
      }`}
    >
      {label}
    </span>
  );
}

function fmt(h: number): string {
  return (Math.round(h * 10) / 10).toString();
}
