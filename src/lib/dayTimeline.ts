// Turns one day of the shared schedule into an hour-by-hour timeline for the Workload
// Calendar's Daily View. It adds no scheduling maths: the task hours come from
// `computeEmployeeSchedule().planForRange`, the calendar events from the same store
// everything else reads, and a fixed lunch hour rounds out the working day. Tasks are
// laid into whatever time the fixed commitments leave, in priority order.

import type { Employee } from "@/data/types";
import type { EmployeeSchedule, ScheduledWorkItem } from "@/lib/capacityEngine";
import { prioritiseWork } from "@/lib/prioritize";

export type SegmentKind = "event" | "lunch" | "task" | "coverage" | "idle";

export interface TimelineSegment {
  startMin: number;
  endMin: number;
  kind: SegmentKind;
  title: string;
  hours: number;
  ticketId?: string | null;
  status?: string;
  priority?: "High" | "Medium" | "Low";
}

export interface DayTimeline {
  dayStartMin: number;
  dayEndMin: number;
  onLeave: boolean;
  isWorkingDay: boolean;
  segments: TimelineSegment[];
  plannedHours: number;
  eventHours: number;
  availableHours: number;
  /** Task hours that didn't fit the day's remaining time. */
  unplacedHours: number;
}

const LUNCH_START = 13 * 60; // 13:00
const LUNCH_END = 14 * 60; // 14:00 — matches the day-plan example

function parseClock(text: string, fallback: number): number {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(text);
  if (!m) return fallback;
  let h = Number(m[1]) % 12;
  if (m[3] && m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

function timeToMin(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

export function minLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Build the timeline for `date`. `schedule` must be the employee's own schedule for
 * the surrounding window (so `planForRange` covers this day). */
export function buildDayTimeline(schedule: EmployeeSchedule, employee: Employee, date: Date): DayTimeline {
  const [startText, endText] = (employee.workingSchedule || "").split("–").slice(-2);
  const dayStartMin = parseClock(startText ?? "", 7 * 60);
  const dayEndMin = Math.max(dayStartMin + 60, parseClock(endText ?? "", 16 * 60));

  const plan = schedule.planForRange(date, 1)[0];
  const sameDay = plan && plan.date.getFullYear() === date.getFullYear() && plan.date.getMonth() === date.getMonth() && plan.date.getDate() === date.getDate();

  if (!plan || !sameDay) {
    return { dayStartMin, dayEndMin, onLeave: false, isWorkingDay: false, segments: [], plannedHours: 0, eventHours: 0, availableHours: 0, unplacedHours: 0 };
  }
  if (plan.onLeave) {
    return {
      dayStartMin,
      dayEndMin,
      onLeave: true,
      isWorkingDay: false,
      segments: [{ startMin: dayStartMin, endMin: dayEndMin, kind: "idle", title: "On leave", hours: 0 }],
      plannedHours: 0,
      eventHours: plan.eventHours,
      availableHours: 0,
      unplacedHours: 0,
    };
  }

  // Fixed blocks: timed calendar events + a lunch hour, clamped to the working day.
  const fixed: TimelineSegment[] = [];
  plan.calendarEvents.forEach((ev) => {
    const s = Math.max(dayStartMin, timeToMin(ev.startTime));
    const e = Math.min(dayEndMin, timeToMin(ev.endTime));
    if (e > s) fixed.push({ startMin: s, endMin: e, kind: "event", title: ev.title, hours: Math.round(((e - s) / 60) * 10) / 10 });
  });
  if (LUNCH_END > dayStartMin && LUNCH_START < dayEndMin) {
    fixed.push({
      startMin: Math.max(dayStartMin, LUNCH_START),
      endMin: Math.min(dayEndMin, LUNCH_END),
      kind: "lunch",
      title: "Lunch / unavailable",
      hours: 1,
    });
  }
  fixed.sort((a, b) => a.startMin - b.startMin);

  // Free gaps between fixed blocks.
  const gaps: { start: number; end: number }[] = [];
  let cursor = dayStartMin;
  for (const f of fixed) {
    if (f.startMin > cursor) gaps.push({ start: cursor, end: f.startMin });
    cursor = Math.max(cursor, f.endMin);
  }
  if (cursor < dayEndMin) gaps.push({ start: cursor, end: dayEndMin });

  // Task allocations for the day, ordered by priority so the day reads sensibly.
  const byKey = new Map(schedule.items.map((i) => [i.key, i] as const));
  const ranked = prioritiseWork(
    plan.allocations.map((a) => a.item).filter((i): i is ScheduledWorkItem => !!i),
    plan.availableHours
  );
  const rankIndex = new Map(ranked.map((r, i) => [r.item.key, i] as const));
  const allocs = plan.allocations
    .slice()
    .sort((a, b) => (rankIndex.get(a.item.key) ?? 99) - (rankIndex.get(b.item.key) ?? 99))
    .map((a) => ({ item: byKey.get(a.item.key) ?? a.item, minutes: Math.round(a.hours * 60) }));

  const taskSegs: TimelineSegment[] = [];
  let gi = 0;
  let placed = 0;
  let totalTaskMin = 0;
  for (const a of allocs) {
    totalTaskMin += a.minutes;
    let need = a.minutes;
    while (need > 0 && gi < gaps.length) {
      const g = gaps[gi];
      const room = g.end - g.start;
      if (room <= 0) {
        gi += 1;
        continue;
      }
      const take = Math.min(room, need);
      taskSegs.push({
        startMin: g.start,
        endMin: g.start + take,
        kind: a.item.isCoverage ? "coverage" : "task",
        title: a.item.isCoverage ? `${a.item.title} (covering ${a.item.coverageOwnerName ?? ""})` : a.item.title,
        hours: Math.round((take / 60) * 10) / 10,
        ticketId: a.item.ticketId ?? null,
        priority: a.item.priority,
        status: a.item.overdue ? "Overdue" : a.item.deadlineUnreachable ? "Deadline risk" : a.item.isCoverage ? "Coverage" : "In Progress",
      });
      g.start += take;
      need -= take;
      placed += take;
      if (g.start >= g.end) gi += 1;
    }
  }

  // Remaining gaps → available / idle time.
  const idleSegs: TimelineSegment[] = [];
  for (let i = gi; i < gaps.length; i++) {
    const g = gaps[i];
    if (g.end > g.start) idleSegs.push({ startMin: g.start, endMin: g.end, kind: "idle", title: "Available", hours: Math.round(((g.end - g.start) / 60) * 10) / 10 });
  }
  // Also any leftover slivers inside partially-filled gaps handled above by g.start advance.

  const segments = [...fixed, ...taskSegs, ...idleSegs].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  return {
    dayStartMin,
    dayEndMin,
    onLeave: false,
    isWorkingDay: true,
    segments,
    plannedHours: Math.round((placed / 60) * 10) / 10,
    eventHours: plan.eventHours,
    availableHours: plan.availableHours,
    unplacedHours: Math.round(((totalTaskMin - placed) / 60) * 10) / 10,
  };
}
