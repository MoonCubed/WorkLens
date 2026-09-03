"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarClock, Repeat2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { Employee } from "@/data/types";
import { useTickets } from "@/store/tickets-store";
import { useWorkLog } from "@/store/work-log-store";
import { useCalendarEvents } from "@/store/calendar-events-store";
import { computeEmployeeSchedule, computeEmployeeWeeklyCapacity, type ScheduledWorkItem } from "@/lib/capacityEngine";
import { buildDayTimeline, minLabel, type SegmentKind } from "@/lib/dayTimeline";
import { startOfWeek, addDays, dateKey, isWorkingDay, todayStart, weekOfYear, weekRangeLabel } from "@/lib/date";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NAME_COL = 190;
const LANE_HEIGHT = 26;
const TWO_WEEK_DAYS = 14;
const SIX_WEEKS = 6;

type Mode = "day" | "twoWeek" | "sixWeek";
const MODE_LABEL: Record<Mode, string> = { day: "Day", twoWeek: "2 Weeks", sixWeek: "6 Weeks" };

/** Planned hours vs available hours → the one "approaching / over capacity" language. */
function loadTone(planned: number, available: number): { text: string; cell: string } {
  if (available <= 0 && planned <= 0) return { text: "text-ink-muted", cell: "" };
  const ratio = available > 0 ? planned / available : planned > 0 ? 2 : 0;
  if (ratio > 1) return { text: "text-[var(--status-critical)]", cell: "bg-[var(--status-critical-bg)]" };
  if (ratio >= 0.85) return { text: "text-[var(--status-warning)]", cell: "bg-[var(--status-warning-bg)]" };
  if (ratio > 0) return { text: "text-[var(--status-good)]", cell: "bg-[var(--status-good-bg)]/60" };
  return { text: "text-ink-muted", cell: "" };
}

/** Task-block colour by meaning: overdue/at-risk = red, coverage = teal, ad-hoc =
 * slate, high priority = solid blue, everything else = light blue. */
function itemTone(item: ScheduledWorkItem): string {
  if (item.overdue || item.deadlineUnreachable)
    return "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical)]";
  if (item.isCoverage) return "border-[var(--accent-teal)] bg-[var(--accent-teal-bg)] text-[color:var(--accent-teal)]";
  if (item.blockedByDependency) return "border-border-strong bg-brand-50/60 text-ink-secondary";
  if (item.type === "Ad-hoc") return "border-[var(--status-serious-border)] bg-[var(--status-serious-bg)] text-[var(--status-serious)]";
  if (item.priority === "High") return "border-brand-700 bg-brand-600 text-white";
  return "border-brand-200 bg-brand-100 text-brand-900";
}

const SEG_TONE: Record<SegmentKind, string> = {
  task: "border-brand-300 bg-brand-100 text-brand-900",
  coverage: "border-[var(--accent-teal)] bg-[var(--accent-teal-bg)] text-[color:var(--accent-teal)]",
  event: "border-purple-300 bg-purple-100 text-purple-900",
  lunch: "border-border-strong bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,var(--border)_4px,var(--border)_5px)] text-ink-muted",
  idle: "border-dashed border-border bg-transparent text-ink-muted",
};

interface Seg {
  item: ScheduledWorkItem;
  startIdx: number;
  endIdx: number;
  lane: number;
}
function packLanes(items: Omit<Seg, "lane">[]): Seg[] {
  const sorted = [...items].sort((a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx);
  const laneEnds: number[] = [];
  return sorted.map((it) => {
    let lane = laneEnds.findIndex((end) => end < it.startIdx);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = it.endIdx;
    return { ...it, lane };
  });
}

/**
 * A Float-style workload timeline: people down the side, time across the top.
 * - **Day** — the hour-by-hour plan for one day (calendar events, lunch, task blocks).
 * - **2 Weeks / 6 Weeks** — task blocks and capacity heat across the range.
 * Every number comes from `computeEmployeeSchedule` / the weekly-capacity engine — the
 * same source as every other capacity figure in WorkLens. No scheduling maths here.
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
  const [mode, setMode] = useState<Mode>("twoWeek");
  const [anchor, setAnchor] = useState<Date>(() => startOfWeek(todayStart()));
  const [dayCursor, setDayCursor] = useState<Date>(() => {
    let d = todayStart();
    while (!isWorkingDay(d)) d = addDays(d, 1);
    return d;
  });

  const today = todayStart();
  const days = useMemo(() => Array.from({ length: TWO_WEEK_DAYS }, (_, i) => addDays(anchor, i)), [anchor]);
  const weekStarts = useMemo(() => Array.from({ length: SIX_WEEKS }, (_, i) => addDays(anchor, i * 7)), [anchor]);

  const schedules = useMemo(
    () => employees.map((employee) => ({ employee, schedule: computeEmployeeSchedule(employee, tickets, getEntry, events) })),
    [employees, tickets, getEntry, events]
  );

  function step(dir: 1 | -1) {
    if (mode === "day") {
      setDayCursor((c) => {
        let d = addDays(c, dir);
        while (!isWorkingDay(d)) d = addDays(d, dir);
        return d;
      });
    } else {
      setAnchor((a) => addDays(a, dir * 7));
    }
  }
  function goToday() {
    setAnchor(startOfWeek(todayStart()));
    let d = todayStart();
    while (!isWorkingDay(d)) d = addDays(d, 1);
    setDayCursor(d);
  }

  const header =
    mode === "day"
      ? dayCursor.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
      : mode === "twoWeek"
        ? `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[TWO_WEEK_DAYS - 1].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
        : `Week ${weekOfYear(weekStarts[0])} – ${weekOfYear(weekStarts[SIX_WEEKS - 1])}`;

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{header}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-border-strong bg-surface p-1">
            {(["day", "twoWeek", "sixWeek"] as Mode[]).map((m) => (
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
        <LegendSwatch className="bg-brand-100 border border-brand-300" label="Planned / project work" />
        <LegendSwatch className="bg-brand-600" label="High priority" />
        <LegendSwatch className="bg-[var(--status-serious-bg)] border border-[var(--status-serious-border)]" label="Ad-hoc" />
        <LegendSwatch className="bg-[var(--accent-teal-bg)] border border-[var(--accent-teal)]" label="Turnover coverage" />
        <LegendSwatch className="bg-purple-100 border border-purple-300" label="Calendar event" />
        <LegendSwatch className="bg-[var(--status-critical-bg)] border border-[var(--status-critical-border)]" label="Overdue / over capacity" />
        <span className="ml-auto text-ink-muted">Planned workload vs available working time — not a productivity measure.</span>
      </div>

      {mode === "day" ? (
        <DayTimelineGrid schedules={schedules} date={dayCursor} revealEventTitlesFor={revealEventTitlesFor} />
      ) : (
        <RangeGrid
          mode={mode}
          schedules={schedules}
          days={days}
          weekStarts={weekStarts}
          anchor={anchor}
          today={today}
          tickets={tickets}
          getEntry={getEntry}
          events={events}
          revealEventTitlesFor={revealEventTitlesFor}
        />
      )}

      {employees.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No employees to show.</p>}
    </Card>
  );
}

// ---------------------------------------------------------------- Day (hour timeline)

function DayTimelineGrid({
  schedules,
  date,
  revealEventTitlesFor,
}: {
  schedules: { employee: Employee; schedule: ReturnType<typeof computeEmployeeSchedule> }[];
  date: Date;
  revealEventTitlesFor?: string;
}) {
  const timelines = schedules.map(({ employee, schedule }) => ({ employee, tl: buildDayTimeline(schedule, employee, date) }));
  const dayStart = timelines[0]?.tl.dayStartMin ?? 7 * 60;
  const dayEnd = timelines[0]?.tl.dayEndMin ?? 16 * 60;
  const span = Math.max(1, dayEnd - dayStart);
  const hourMarks: number[] = [];
  for (let h = Math.ceil(dayStart / 60) * 60; h <= dayEnd; h += 60) hourMarks.push(h);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: NAME_COL + 560 }}>
        {/* Hour axis */}
        <div className="flex border-b border-border">
          <div style={{ width: NAME_COL }} className="sticky left-0 z-10 shrink-0 bg-brand-50/60 px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-secondary">
            Employee
          </div>
          <div className="relative flex-1 bg-brand-50/40">
            {hourMarks.map((m) => (
              <span
                key={m}
                className="absolute top-0 -translate-x-1/2 py-1.5 text-[10px] tabular text-ink-muted"
                style={{ left: `${((m - dayStart) / span) * 100}%` }}
              >
                {minLabel(m)}
              </span>
            ))}
            <div className="py-1.5 text-[10px] opacity-0">.</div>
          </div>
        </div>

        {timelines.map(({ employee, tl }) => {
          const reveal = revealEventTitlesFor === employee.id;
          const over = tl.plannedHours + tl.eventHours > tl.availableHours + tl.eventHours + 0.1 || tl.unplacedHours > 0.1;
          return (
            <div key={employee.id} className="flex border-b border-border last:border-0">
              <div style={{ width: NAME_COL }} className="sticky left-0 z-10 shrink-0 bg-surface px-4 py-3">
                <p className="truncate text-sm font-medium text-ink">{employee.name}</p>
                <p className={`text-[11px] ${over ? "text-[var(--status-warning)]" : "text-ink-muted"}`}>
                  {tl.onLeave
                    ? "On leave"
                    : `${tl.plannedHours}h planned · ${tl.availableHours}h available${tl.eventHours > 0 ? ` · ${tl.eventHours}h events` : ""}`}
                </p>
                {tl.unplacedHours > 0.1 && <p className="text-[11px] text-[var(--status-warning)]">+{tl.unplacedHours}h doesn&rsquo;t fit today</p>}
              </div>
              <div className="relative flex-1 py-2" style={{ minHeight: 46 }}>
                {/* Hour gridlines */}
                {hourMarks.map((m) => (
                  <div key={m} className="absolute inset-y-0 border-l border-border/40" style={{ left: `${((m - dayStart) / span) * 100}%` }} />
                ))}
                {tl.segments.map((s, i) => {
                  const left = ((s.startMin - dayStart) / span) * 100;
                  const width = ((s.endMin - s.startMin) / span) * 100;
                  const title = s.kind === "event" && !reveal ? "Personal commitment" : s.title;
                  return (
                    <div
                      key={i}
                      title={`${minLabel(s.startMin)}–${minLabel(s.endMin)} · ${title}${s.hours ? ` · ${s.hours}h` : ""}`}
                      style={{ left: `${left}%`, width: `calc(${width}% - 2px)`, marginLeft: 1 }}
                      className={`absolute inset-y-2 flex items-center overflow-hidden whitespace-nowrap rounded-md border px-1.5 text-[11px] font-medium ${SEG_TONE[s.kind]}`}
                    >
                      <span className="truncate">{title}</span>
                    </div>
                  );
                })}
                {tl.segments.length === 0 && (
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-ink-muted/70">
                    Nothing scheduled
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 2-week / 6-week

function RangeGrid({
  mode,
  schedules,
  days,
  weekStarts,
  anchor,
  today,
  tickets,
  getEntry,
  events,
  revealEventTitlesFor,
}: {
  mode: "twoWeek" | "sixWeek";
  schedules: { employee: Employee; schedule: ReturnType<typeof computeEmployeeSchedule> }[];
  days: Date[];
  weekStarts: Date[];
  anchor: Date;
  today: Date;
  tickets: Parameters<typeof computeEmployeeWeeklyCapacity>[1];
  getEntry: Parameters<typeof computeEmployeeWeeklyCapacity>[2];
  events: Parameters<typeof computeEmployeeWeeklyCapacity>[5];
  revealEventTitlesFor?: string;
}) {
  const rows = useMemo(() => {
    return schedules.map(({ employee, schedule }) => {
      const dayPlans = schedule.planForRange(anchor, TWO_WEEK_DAYS);
      const planByKey = new Map(dayPlans.map((p) => [p.key, p]));
      const segRaw: Omit<Seg, "lane">[] = [];
      schedule.items.forEach((item) => {
        if (item.remainingHours <= 0) return;
        const idxs = days.map((d, i) => (item.workingDayKeys.includes(dateKey(d)) ? i : -1)).filter((i) => i >= 0);
        if (idxs.length === 0) return;
        segRaw.push({ item, startIdx: idxs[0], endIdx: idxs[idxs.length - 1] });
      });
      const segs = packLanes(segRaw);
      const weekly = computeEmployeeWeeklyCapacity(employee, tickets, getEntry, SIX_WEEKS, anchor, events);
      return { employee, planByKey, segs, weekly, revealEvents: revealEventTitlesFor === employee.id };
    });
  }, [schedules, days, anchor, tickets, getEntry, events, revealEventTitlesFor]);

  const gridMinWidth = NAME_COL + (mode === "twoWeek" ? TWO_WEEK_DAYS * 64 : SIX_WEEKS * 120);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: gridMinWidth }}>
        <div className="flex border-b border-border">
          <div style={{ width: NAME_COL }} className="sticky left-0 z-10 shrink-0 bg-brand-50/60 px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-secondary">
            Employee
          </div>
          <div className="flex flex-1 bg-brand-50/40">
            {mode === "twoWeek"
              ? days.map((d, i) => {
                  const isToday = dateKey(d) === dateKey(today);
                  return (
                    <div key={i} className={`flex-1 border-l border-border px-1 py-1.5 text-center ${!isWorkingDay(d) ? "bg-brand-50/70" : ""} ${isToday ? "bg-brand-100" : ""}`}>
                      <div className="text-[10px] uppercase text-ink-muted">{WEEKDAYS[d.getDay()]}</div>
                      <div className={`text-xs tabular ${isToday ? "font-semibold text-brand-800" : "text-ink-secondary"}`}>{d.getDate()}</div>
                    </div>
                  );
                })
              : weekStarts.map((w, i) => (
                  <div key={i} className="flex-1 border-l border-border px-1 py-1.5 text-center">
                    <div className="text-[10px] uppercase text-ink-muted">W{weekOfYear(w)}</div>
                    <div className="text-[11px] tabular text-ink-secondary">{weekRangeLabel(w)}</div>
                  </div>
                ))}
          </div>
        </div>

        {rows.map(({ employee, planByKey, segs, weekly, revealEvents }) => {
          const laneCount = Math.max(1, ...segs.map((s) => s.lane + 1));
          return (
            <div key={employee.id} className="flex border-b border-border last:border-0">
              <div style={{ width: NAME_COL }} className="sticky left-0 z-10 shrink-0 bg-surface px-4 py-2.5">
                <p className="truncate text-sm font-medium text-ink">{employee.name}</p>
                <p className="text-[11px] text-ink-muted">
                  {weekly[0] ? `${weekly[0].scheduledHours}h / ${weekly[0].workingHours}h · wk ${weekly[0].weekNumber}` : ""}
                </p>
              </div>
              <div className="relative flex-1">
                <div className="absolute inset-0 flex">
                  {mode === "twoWeek"
                    ? days.map((d, i) => {
                        const plan = planByKey.get(dateKey(d));
                        const working = isWorkingDay(d);
                        const tone = working && !plan?.onLeave ? loadTone(plan?.totalHours ?? 0, plan?.availableHours ?? 0) : { cell: "bg-brand-50/40" };
                        return <div key={i} className={`flex-1 border-l border-border ${tone.cell} ${dateKey(d) === dateKey(today) ? "ring-1 ring-inset ring-brand-200" : ""}`} />;
                      })
                    : weekly.map((wk, i) => {
                        const tone = loadTone(wk.scheduledHours, wk.workingHours);
                        return <div key={i} className={`flex-1 border-l border-border ${tone.cell} ${wk.isCurrent ? "ring-1 ring-inset ring-brand-200" : ""}`} />;
                      })}
                </div>

                {mode === "twoWeek" ? (
                  <div className="relative" style={{ minHeight: laneCount * LANE_HEIGHT + 34 }}>
                    {segs.map((seg) => {
                      const left = (seg.startIdx / TWO_WEEK_DAYS) * 100;
                      const width = ((seg.endIdx - seg.startIdx + 1) / TWO_WEEK_DAYS) * 100;
                      const status = seg.item.overdue
                        ? "Overdue"
                        : seg.item.deadlineUnreachable
                          ? "Deadline risk"
                          : seg.item.blockedByDependency
                            ? "Waiting on dependency"
                            : seg.item.isCoverage
                              ? `Covering for ${seg.item.coverageOwnerName ?? ""}`
                              : seg.item.status === "On Hold"
                                ? "On Hold"
                                : "In Progress";
                      return (
                        <div
                          key={seg.item.key}
                          title={`${seg.item.title} · ${seg.item.dailyHours}h/day · ${status} · due ${seg.item.deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                          style={{ left: `${left}%`, width: `calc(${width}% - 4px)`, marginLeft: 2, top: seg.lane * LANE_HEIGHT + 6 }}
                          className={`absolute flex h-[22px] items-center gap-1 overflow-hidden whitespace-nowrap rounded-md border px-1.5 text-[11px] font-medium ${itemTone(seg.item)}`}
                        >
                          {seg.item.isCoverage && <Repeat2 className="h-3 w-3 shrink-0" />}
                          <span className="truncate">{seg.item.title}</span>
                          <span className="shrink-0 tabular opacity-80">{seg.item.dailyHours}h</span>
                        </div>
                      );
                    })}

                    <div className="absolute inset-x-0 bottom-0 flex">
                      {days.map((d, i) => {
                        const plan = planByKey.get(dateKey(d));
                        if (!isWorkingDay(d)) return <div key={i} className="flex-1" />;
                        if (plan?.onLeave)
                          return (
                            <div key={i} className="flex-1 border-l border-border/50 py-0.5 text-center text-[10px] font-medium text-[var(--status-warning)]">
                              Leave
                            </div>
                          );
                        const tone = loadTone(plan?.totalHours ?? 0, plan?.availableHours ?? 0);
                        return (
                          <div key={i} className="flex-1 border-l border-border/50 py-0.5 text-center">
                            <span className={`text-[10px] font-semibold tabular ${tone.text}`}>{plan?.totalHours ?? 0}</span>
                            {plan && plan.eventHours > 0 && (
                              <span
                                className="ml-0.5 inline-flex items-center text-purple-500"
                                title={
                                  revealEvents
                                    ? plan.calendarEvents.map((e) => `${e.title} ${e.startTime}–${e.endTime}`).join(", ")
                                    : `${plan.eventHours}h personal time`
                                }
                              >
                                <CalendarClock className="h-2.5 w-2.5" />
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {segs.length === 0 && (
                      <span className="pointer-events-none absolute left-2 top-2 text-[11px] text-ink-muted/70">No scheduled work in this window</span>
                    )}
                  </div>
                ) : (
                  <div className="relative flex" style={{ minHeight: 52 }}>
                    {weekly.map((wk, i) => {
                      const tone = loadTone(wk.scheduledHours, wk.workingHours);
                      return (
                        <div key={i} className="flex flex-1 flex-col items-center justify-center border-l border-border/50 py-2">
                          <span className={`text-sm font-semibold tabular ${tone.text}`}>{wk.scheduledHours}h</span>
                          <span className="text-[10px] text-ink-muted">of {wk.workingHours}h · {wk.utilization}%</span>
                          <span className="text-[10px] text-ink-muted">{wk.taskCount} task{wk.taskCount === 1 ? "" : "s"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
