"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarClock, Repeat2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { Employee } from "@/data/types";
import { useTickets } from "@/store/tickets-store";
import { useWorkLog } from "@/store/work-log-store";
import { useCalendarEvents } from "@/store/calendar-events-store";
import { useDayPlans } from "@/store/day-plans-store";
import { computeEmployeeSchedule, computeEmployeeWeeklyCapacity } from "@/lib/capacityEngine";
import { buildDayTimeline, minLabel, LUNCH_START_MIN, LUNCH_END_MIN, type DayTimeline, type SegmentKind } from "@/lib/dayTimeline";
import { EmployeeCapacityHover } from "@/components/employee/EmployeeCapacityHover";
import { startOfWeek, addDays, dateKey, isWorkingDay, todayStart, weekOfYear, weekRangeLabel } from "@/lib/date";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NAME_COL = 190;
const HOUR_COL = 46;
/** Pixel height of one employee's day track (the 07:00–16:00 span). */
const TRACK_H = 260;
const SIX_WEEKS = 6;

type Mode = "week" | "twoWeek" | "sixWeek";
const MODE_LABEL: Record<Mode, string> = { week: "Week", twoWeek: "2 Weeks", sixWeek: "6 Weeks" };
const MODE_DAYS: Record<"week" | "twoWeek", number> = { week: 5, twoWeek: 10 };

/** Planned hours vs available hours → the one "approaching / over capacity" language. */
function loadTone(planned: number, available: number): { text: string; cell: string } {
  if (available <= 0 && planned <= 0) return { text: "text-ink-muted", cell: "" };
  const ratio = available > 0 ? planned / available : planned > 0 ? 2 : 0;
  if (ratio > 1) return { text: "text-[var(--status-critical)]", cell: "bg-[var(--status-critical-bg)]" };
  if (ratio >= 0.85) return { text: "text-[var(--status-warning)]", cell: "bg-[var(--status-warning-bg)]" };
  if (ratio > 0) return { text: "text-[var(--status-good)]", cell: "bg-[var(--status-good-bg)]/60" };
  return { text: "text-ink-muted", cell: "" };
}

const SEG_TONE: Record<SegmentKind, string> = {
  task: "border-brand-300 bg-brand-100 text-brand-900",
  coverage: "border-[var(--accent-teal)] bg-[var(--accent-teal-bg)] text-[color:var(--accent-teal)]",
  event: "border-purple-300 bg-purple-100 text-purple-900",
  lunch:
    "border-border-strong bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,var(--border)_5px,var(--border)_6px)] text-ink-muted",
  idle: "border-dashed border-border bg-transparent text-ink-muted",
};

/**
 * A Float-style workload calendar: employees as rows, **dates across the X-axis** and
 * **clock time down the Y-axis** (07:00 at the top → 16:00 at the bottom). Each task
 * sits in the actual time slot it's scheduled for ("Firewall audit · 2h" at 09:00–
 * 11:00), calendar events and the 11:30–12:30 lunch break are drawn as fixed blocks,
 * and non-working days / leave are shaded out. Everything is positioned from
 * `computeEmployeeSchedule` + `buildDayTimeline` — the same source as every other
 * capacity figure in WorkLens. No scheduling maths here.
 *
 * `revealEventTitlesFor` names the one employee (viewing their own workload) whose
 * personal calendar-event titles are shown; for everyone else a timed event is only
 * blocked time.
 */
export function WorkloadView({
  employees,
  revealEventTitlesFor,
  subtitle,
}: {
  employees: Employee[];
  revealEventTitlesFor?: string;
  subtitle?: string;
}) {
  const { tickets } = useTickets();
  const { getEntry } = useWorkLog();
  const { events } = useCalendarEvents();
  const { getPlan } = useDayPlans();
  // Opens on the hour-by-hour Week view by default — the clearest "what does this
  // person's actual working day look like" read. 2 Weeks / 6 Weeks stay one click away.
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState<Date>(() => startOfWeek(todayStart()));

  const today = todayStart();
  const weekStarts = useMemo(() => Array.from({ length: SIX_WEEKS }, (_, i) => addDays(anchor, i * 7)), [anchor]);

  // The working days (Sun–Thu) shown across the X-axis for the time-grid modes.
  const gridDays = useMemo(() => {
    if (mode === "sixWeek") return [];
    const want = MODE_DAYS[mode];
    const out: Date[] = [];
    let d = new Date(anchor);
    // Guard against an infinite loop; 3 weeks of calendar days is plenty for 10 working days.
    for (let i = 0; i < 30 && out.length < want; i++) {
      if (isWorkingDay(d)) out.push(new Date(d));
      d = addDays(d, 1);
    }
    return out;
  }, [anchor, mode]);

  const schedules = useMemo(
    () => employees.map((employee) => ({ employee, schedule: computeEmployeeSchedule(employee, tickets, getEntry, events) })),
    [employees, tickets, getEntry, events]
  );

  function step(dir: 1 | -1) {
    setAnchor((a) => addDays(a, dir * 7));
  }
  function goToday() {
    setAnchor(startOfWeek(todayStart()));
  }

  const header =
    mode === "sixWeek"
      ? `Week ${weekOfYear(weekStarts[0])} – ${weekOfYear(weekStarts[SIX_WEEKS - 1])}`
      : gridDays.length > 0
        ? `${gridDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${gridDays[gridDays.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
        : "";

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{header}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-border-strong bg-surface p-1">
            {(["week", "twoWeek", "sixWeek"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  mode === m ? "bg-brand-800 text-white" : "text-ink-secondary hover:bg-brand-50"
                }`}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => step(-1)} className="rounded-lg border border-border-strong p-1.5 text-ink-secondary hover:bg-brand-50" aria-label="Earlier">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={goToday} className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-brand-50">
              Today
            </button>
            <button onClick={() => step(1)} className="rounded-lg border border-border-strong p-1.5 text-ink-secondary hover:bg-brand-50" aria-label="Later">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border px-4 py-2.5 text-xs text-ink-secondary">
        <LegendSwatch className="bg-brand-100 border border-brand-300" label="Task / project work" />
        <LegendSwatch className="bg-[var(--accent-teal-bg)] border border-[var(--accent-teal)]" label="Turnover coverage" />
        <LegendSwatch className="bg-purple-100 border border-purple-300" label="Calendar event" />
        <LegendSwatch className="border border-border-strong bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--border)_3px,var(--border)_4px)]" label="Lunch 11:30–12:30" />
        <LegendSwatch className="bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)]" label="Leave / non-working" />
        <span className="flex items-center gap-1.5"><span className="text-brand-600">●</span> Confirmed Plan My Day</span>
        <span className="ml-auto text-ink-muted">Planned workload vs available working time — not a productivity measure.</span>
      </div>

      {employees.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-muted">No employees to show.</p>
      ) : mode === "sixWeek" ? (
        <SixWeekGrid schedules={schedules} weekStarts={weekStarts} anchor={anchor} tickets={tickets} getEntry={getEntry} events={events} />
      ) : (
        <TimeGrid schedules={schedules} days={gridDays} today={today} anchor={anchor} tickets={tickets} getEntry={getEntry} events={events} getPlan={getPlan} revealEventTitlesFor={revealEventTitlesFor} />
      )}
    </Card>
  );
}

// ------------------------------------------------------------ Week / 2-week time grid

function TimeGrid({
  schedules,
  days,
  today,
  anchor,
  tickets,
  getEntry,
  events,
  getPlan,
  revealEventTitlesFor,
}: {
  schedules: { employee: Employee; schedule: ReturnType<typeof computeEmployeeSchedule> }[];
  days: Date[];
  today: Date;
  anchor: Date;
  tickets: Parameters<typeof computeEmployeeWeeklyCapacity>[1];
  getEntry: Parameters<typeof computeEmployeeWeeklyCapacity>[2];
  events: Parameters<typeof computeEmployeeWeeklyCapacity>[5];
  getPlan: ReturnType<typeof useDayPlans>["getPlan"];
  revealEventTitlesFor?: string;
}) {
  const rows = useMemo(
    () =>
      schedules.map(({ employee, schedule }) => ({
        employee,
        timelines: days.map((d) => buildDayTimeline(schedule, employee, d, getPlan(employee.id, dateKey(d)))),
        weekly: computeEmployeeWeeklyCapacity(employee, tickets, getEntry, 1, anchor, events)[0],
        loggedHours: Math.round(schedule.items.reduce((s, it) => s + (getEntry(it.key).actualHours ?? 0), 0) * 10) / 10,
        revealEvents: revealEventTitlesFor === employee.id,
      })),
    [schedules, days, anchor, tickets, getEntry, events, getPlan, revealEventTitlesFor]
  );

  // One shared clock scale for the whole grid so every row lines up.
  const { gridStart, gridEnd } = useMemo(() => {
    let s = 7 * 60;
    let e = 16 * 60;
    rows.forEach((r) =>
      r.timelines.forEach((tl) => {
        s = Math.min(s, tl.dayStartMin);
        e = Math.max(e, tl.dayEndMin);
      })
    );
    return { gridStart: s, gridEnd: e };
  }, [rows]);
  const span = Math.max(60, gridEnd - gridStart);

  // Hourly gridlines; label every hour (the span is short enough).
  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let m = Math.ceil(gridStart / 60) * 60; m <= gridEnd; m += 60) marks.push(m);
    return marks;
  }, [gridStart, gridEnd]);

  const dayColMin = 116;
  const gridMinWidth = NAME_COL + HOUR_COL + days.length * dayColMin;
  const pct = (min: number) => `${((min - gridStart) / span) * 100}%`;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: gridMinWidth }}>
        {/* Day header (X-axis) */}
        <div className="flex border-b border-border bg-brand-50/40">
          <div style={{ width: NAME_COL }} className="sticky left-0 z-20 shrink-0 bg-brand-50/60 px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-secondary">
            Employee
          </div>
          <div style={{ width: HOUR_COL }} className="shrink-0" />
          {days.map((d, i) => {
            const isToday = dateKey(d) === dateKey(today);
            return (
              <div key={i} className={`flex-1 border-l border-border px-1 py-1.5 text-center ${isToday ? "bg-brand-100" : ""}`}>
                <div className="text-[10px] uppercase text-ink-muted">{WEEKDAYS[d.getDay()]}</div>
                <div className={`text-xs tabular ${isToday ? "font-semibold text-brand-800" : "text-ink-secondary"}`}>
                  {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              </div>
            );
          })}
        </div>

        {rows.map(({ employee, timelines, weekly, loggedHours, revealEvents }) => {
          const weekPlanned = timelines.reduce((s, tl) => s + tl.plannedHours, 0);
          const weekAvail = timelines.reduce((s, tl) => s + tl.availableHours, 0);
          const tone = loadTone(weekPlanned, weekAvail);
          const unplaced = Math.round(timelines.reduce((s, tl) => s + tl.unplacedHours, 0) * 10) / 10;
          return (
            <div key={employee.id} className="flex border-b border-border last:border-0">
              {/* Name / week capacity */}
              <div style={{ width: NAME_COL }} className="sticky left-0 z-20 shrink-0 bg-surface px-4 py-3">
                <EmployeeCapacityHover employee={employee}>
                  <p className="truncate text-sm font-medium text-ink">{employee.name}</p>
                </EmployeeCapacityHover>
                <p className={`mt-0.5 text-[11px] ${tone.text}`}>
                  {weekly ? `${weekly.scheduledHours}h / ${weekly.workingHours}h this week · ${weekly.utilization}%` : `${weekPlanned}h planned`}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {loggedHours > 0 ? `${loggedHours}h actually logged` : "no time logged yet"}
                </p>
                {unplaced > 0.1 && (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--status-warning)]">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {unplaced}h won&rsquo;t fit
                  </p>
                )}
              </div>

              {/* Hour gutter (Y-axis) */}
              <div style={{ width: HOUR_COL, height: TRACK_H }} className="relative shrink-0">
                {hourMarks.map((m) => (
                  <span key={m} className="absolute right-1 -translate-y-1/2 text-[9px] tabular text-ink-muted" style={{ top: pct(m) }}>
                    {minLabel(m)}
                  </span>
                ))}
              </div>

              {/* One column per day */}
              {timelines.map((tl, di) => (
                <DayTrack
                  key={di}
                  tl={tl}
                  date={days[di]}
                  isToday={dateKey(days[di]) === dateKey(today)}
                  gridStart={gridStart}
                  span={span}
                  hourMarks={hourMarks}
                  revealEvents={revealEvents}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayTrack({
  tl,
  date,
  isToday,
  gridStart,
  span,
  hourMarks,
  revealEvents,
}: {
  tl: DayTimeline;
  date: Date;
  isToday: boolean;
  gridStart: number;
  span: number;
  hourMarks: number[];
  revealEvents: boolean;
}) {
  const pct = (min: number) => ((min - gridStart) / span) * 100;
  const blocks = tl.segments.filter((s) => s.kind !== "idle");

  return (
    <div
      className={`relative flex-1 border-l border-border ${isToday ? "bg-brand-50/50" : ""}`}
      style={{ height: TRACK_H }}
    >
      {/* Hour gridlines */}
      {hourMarks.map((m) => (
        <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-border/40" style={{ top: `${pct(m)}%` }} />
      ))}
      {/* Lunch band — always drawn so the 11:30–12:30 break is unmistakable. */}
      <div
        className="pointer-events-none absolute inset-x-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,var(--border)_5px,var(--border)_6px)]"
        style={{ top: `${pct(LUNCH_START_MIN)}%`, height: `${pct(LUNCH_END_MIN) - pct(LUNCH_START_MIN)}%` }}
      />

      {tl.onLeave ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--status-warning-bg)]/70 text-[11px] font-medium text-[var(--status-warning)]">
          On leave
        </div>
      ) : !tl.isWorkingDay ? (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-50/60 text-[11px] text-ink-muted">Non-working</div>
      ) : (
        <>
          {blocks.map((s, i) => {
            const top = pct(s.startMin);
            const height = Math.max(2.5, pct(s.endMin) - pct(s.startMin));
            const label = s.kind === "event" && !revealEvents ? "Personal commitment" : s.title;
            const tiny = height < 9;
            return (
              <div
                key={i}
                title={`${minLabel(s.startMin)}–${minLabel(s.endMin)} · ${label}${s.hours ? ` · ${s.hours}h` : ""}`}
                className={`absolute inset-x-0.5 overflow-hidden rounded-[5px] border px-1 text-[10px] font-medium leading-tight ${SEG_TONE[s.kind]} ${tiny ? "py-0" : "py-0.5"}`}
                style={{ top: `${top}%`, height: `${height}%` }}
              >
                {s.kind === "lunch" ? (
                  <span className="truncate">Lunch</span>
                ) : (
                  <span className="flex items-center gap-1">
                    {s.kind === "coverage" && <Repeat2 className="h-2.5 w-2.5 shrink-0" />}
                    {s.kind === "event" && <CalendarClock className="h-2.5 w-2.5 shrink-0" />}
                    <span className="truncate">
                      {label}
                      {s.hours > 0 && !tiny ? ` · ${s.hours}h` : ""}
                    </span>
                  </span>
                )}
              </div>
            );
          })}

          {/* Day total, pinned to the bottom of the track. */}
          <div className="absolute inset-x-0 bottom-0 border-t border-border/60 bg-surface/80 px-1 py-0.5 text-center text-[10px] tabular text-ink-muted">
            {tl.fromConfirmedPlan && <span className="mr-1 text-brand-600" title="From this employee's confirmed Plan My Day">●</span>}
            {tl.plannedHours > 0 ? `${tl.plannedHours}h planned` : "—"}
          </div>
        </>
      )}

      {/* Non-descriptive but keeps very empty columns from collapsing visually */}
      {tl.isWorkingDay && !tl.onLeave && blocks.length === 0 && (
        <span className="pointer-events-none absolute left-1 top-1 text-[10px] text-ink-muted/70">Open</span>
      )}
      <span className="sr-only">{date.toDateString()}</span>
    </div>
  );
}

// ---------------------------------------------------------------------- 6-week heat

function SixWeekGrid({
  schedules,
  weekStarts,
  anchor,
  tickets,
  getEntry,
  events,
}: {
  schedules: { employee: Employee; schedule: ReturnType<typeof computeEmployeeSchedule> }[];
  weekStarts: Date[];
  anchor: Date;
  tickets: Parameters<typeof computeEmployeeWeeklyCapacity>[1];
  getEntry: Parameters<typeof computeEmployeeWeeklyCapacity>[2];
  events: Parameters<typeof computeEmployeeWeeklyCapacity>[5];
}) {
  const rows = useMemo(
    () =>
      schedules.map(({ employee }) => ({
        employee,
        weekly: computeEmployeeWeeklyCapacity(employee, tickets, getEntry, SIX_WEEKS, anchor, events),
      })),
    [schedules, anchor, tickets, getEntry, events]
  );
  const gridMinWidth = NAME_COL + SIX_WEEKS * 120;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: gridMinWidth }}>
        <div className="flex border-b border-border bg-brand-50/40">
          <div style={{ width: NAME_COL }} className="sticky left-0 z-20 shrink-0 bg-brand-50/60 px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-secondary">
            Employee
          </div>
          <div className="flex flex-1">
            {weekStarts.map((w, i) => (
              <div key={i} className="flex-1 border-l border-border px-1 py-1.5 text-center">
                <div className="text-[10px] uppercase text-ink-muted">W{weekOfYear(w)}</div>
                <div className="text-[11px] tabular text-ink-secondary">{weekRangeLabel(w)}</div>
              </div>
            ))}
          </div>
        </div>

        {rows.map(({ employee, weekly }) => (
          <div key={employee.id} className="flex border-b border-border last:border-0">
            <div style={{ width: NAME_COL }} className="sticky left-0 z-20 shrink-0 bg-surface px-4 py-2.5">
              <EmployeeCapacityHover employee={employee}>
                <p className="truncate text-sm font-medium text-ink">{employee.name}</p>
              </EmployeeCapacityHover>
              <p className="text-[11px] text-ink-muted">
                {weekly[0] ? `${weekly[0].scheduledHours}h / ${weekly[0].workingHours}h · wk ${weekly[0].weekNumber}` : ""}
              </p>
            </div>
            <div className="flex flex-1">
              {weekly.map((wk, i) => {
                const tone = loadTone(wk.scheduledHours, wk.workingHours);
                return (
                  <div
                    key={i}
                    className={`flex flex-1 flex-col items-center justify-center border-l border-border/50 py-2 ${tone.cell} ${wk.isCurrent ? "ring-1 ring-inset ring-brand-200" : ""}`}
                  >
                    <span className={`text-sm font-semibold tabular ${tone.text}`}>{wk.scheduledHours}h</span>
                    <span className="text-[10px] text-ink-muted">
                      of {wk.workingHours}h · {wk.utilization}%
                    </span>
                    <span className="text-[10px] text-ink-muted">
                      {wk.taskCount} task{wk.taskCount === 1 ? "" : "s"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${className}`} />
      {label}
    </span>
  );
}
