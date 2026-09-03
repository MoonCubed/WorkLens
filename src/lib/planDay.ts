// Plan My Day — turns the shared schedule + capacity + priority ranking into a
// suggested order and hour split for a single day. It creates nothing new: available
// hours come from `computeEmployeeSchedule().planForRange` (leave + calendar events
// already subtracted), the task list is the employee's real active work, and the
// order is `prioritiseWork`. The employee reviews it and only then is it saved as a
// `day_plans` row. Weekly / overall capacity stay derived from the engine.

import type { Employee } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import type { CalendarEvent } from "@/store/calendar-events-store";
import type { WorkLogLookup } from "@/lib/capacityEngine";
import { computeEmployeeSchedule } from "@/lib/capacityEngine";
import { prioritiseWork, recommendationReason } from "@/lib/prioritize";
import { dateKey, getDueStatus, daysBetween, todayStart } from "@/lib/date";
import type { EmployeeSchedule, EmployeeCapacity } from "@/lib/capacityEngine";

export interface DayPlanRow {
  key: string;
  title: string;
  ticketId: string | null;
  /** "In Progress" | "Overdue" | "Deadline risk" | "Waiting on prerequisite" */
  status: string;
  hours: number;
  remainingHours: number;
  reason: string;
}

export interface DayPlanSuggestion {
  date: Date;
  dateKey: string;
  onLeave: boolean;
  /** Contracted hours for the day minus timed calendar events (0 on leave). */
  availableHours: number;
  eventHours: number;
  calendarEvents: { title: string; startTime: string; endTime: string; hours: number }[];
  rows: DayPlanRow[];
  totalPlanned: number;
  /** Active work that didn't fit today's available hours. */
  unscheduled: { title: string; remainingHours: number; reason: string }[];
  /** One-line framing shown above the list. */
  headline: string;
  /** "Recommended because: …" for the highest-priority task, or "" when nothing ranks. */
  topRecommendation: string;
}

function statusLabel(item: { overdue: boolean; deadlineUnreachable: boolean; blockedByDependency: boolean; deadline: Date }): string {
  if (item.blockedByDependency) return "Waiting on prerequisite";
  if (item.overdue) return "Overdue";
  if (item.deadlineUnreachable) return "Deadline risk";
  if (getDueStatus(item.deadline.toISOString()) === "Due Soon") return "Due soon";
  return "In Progress";
}

/**
 * Build the suggestion for `date`. `capForTask` caps how much of one task lands in a
 * single day: its natural even-spread daily share, unless it's overdue / at risk (then
 * it may take as much as fits). Nothing is written here.
 */
export function buildDayPlan(
  employee: Employee,
  tickets: AssignedTicket[],
  getEntry: WorkLogLookup,
  events: CalendarEvent[],
  date: Date
): DayPlanSuggestion {
  const schedule = computeEmployeeSchedule(employee, tickets, getEntry, events);
  const plan = schedule.planForRange(date, 1)[0];
  const key = dateKey(date);

  // Non-working day (weekend) or nothing resolves for the day.
  if (!plan) {
    return {
      date,
      dateKey: key,
      onLeave: false,
      availableHours: 0,
      eventHours: 0,
      calendarEvents: [],
      rows: [],
      totalPlanned: 0,
      unscheduled: [],
      headline: "Not a working day.",
      topRecommendation: "",
    };
  }

  const available = plan.availableHours;
  const ranked = prioritiseWork(
    schedule.activeItems.filter((i) => !i.blockedByDependency),
    available
  );
  const blocked = schedule.activeItems.filter((i) => i.blockedByDependency && i.remainingHours > 0);

  const rows: DayPlanRow[] = [];
  let left = available;

  for (const p of ranked) {
    if (left <= 0.1) break;
    const item = p.item;
    const urgent = item.overdue || item.deadlineUnreachable || getDueStatus(item.deadline.toISOString()) === "Due Soon";
    const naturalShare = item.dailyHours > 0 ? item.dailyHours : item.remainingHours;
    let alloc = Math.min(item.remainingHours, urgent ? left : Math.max(naturalShare, 0), left);
    alloc = Math.round(alloc * 10) / 10;
    if (alloc < 0.25) continue;
    rows.push({
      key: item.key,
      title: item.title,
      ticketId: item.ticketId ?? null,
      status: statusLabel(item),
      hours: alloc,
      remainingHours: item.remainingHours,
      reason: p.reason,
    });
    left = Math.round((left - alloc) * 10) / 10;
  }

  const plannedKeys = new Set(rows.map((r) => r.key));
  const unscheduled = [
    ...ranked
      .filter((p) => !plannedKeys.has(p.item.key))
      .map((p) => ({ title: p.item.title, remainingHours: p.item.remainingHours, reason: p.reason })),
    ...blocked.map((i) => ({
      title: i.title,
      remainingHours: i.remainingHours,
      reason: `waiting on ${i.dependencyTitle ?? "a prerequisite"}`,
    })),
  ];

  const totalPlanned = Math.round(rows.reduce((s, r) => s + r.hours, 0) * 10) / 10;
  const headline = plan.onLeave
    ? "You're on leave this day."
    : `${available}h available${plan.eventHours > 0 ? ` (after ${plan.eventHours}h of calendar events)` : ""}`;

  return {
    date,
    dateKey: key,
    onLeave: plan.onLeave,
    availableHours: available,
    eventHours: plan.eventHours,
    calendarEvents: plan.calendarEvents.map((e) => ({
      title: e.title,
      startTime: e.startTime,
      endTime: e.endTime,
      hours: e.hours,
    })),
    rows,
    totalPlanned,
    unscheduled,
    headline,
    topRecommendation: ranked[0] ? recommendationReason(ranked[0], available) : "",
  };
}

export interface PlanRecommendation {
  tone: "info" | "warn" | "critical";
  text: string;
}

/**
 * Short, explained recommendations for the day the employee is planning — built from
 * their real schedule, remaining effort, deadlines, priority, availability and the
 * hours they've chosen. Never changes anything; just advises and says why.
 */
export function buildPlanRecommendations(
  schedule: EmployeeSchedule,
  capacity: EmployeeCapacity,
  opts: { selectedHoursByKey: Record<string, number>; availableHours: number; manualHours: number; staleTitles?: string[] }
): PlanRecommendation[] {
  const recs: PlanRecommendation[] = [];
  const today = todayStart();
  const active = schedule.activeItems.filter((i) => i.remainingHours > 0);
  const selectedTotal =
    Object.values(opts.selectedHoursByKey).reduce((s, h) => s + (h || 0), 0) + (opts.manualHours || 0);

  // Deadline proximity.
  active
    .filter((i) => {
      const d = daysBetween(today, new Date(i.deadline.getFullYear(), i.deadline.getMonth(), i.deadline.getDate()));
      return d >= 0 && d <= 2;
    })
    .slice(0, 2)
    .forEach((i) => {
      const d = daysBetween(today, new Date(i.deadline.getFullYear(), i.deadline.getMonth(), i.deadline.getDate()));
      const when = d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
      recs.push({ tone: d === 0 ? "critical" : "warn", text: `Due soon: ${i.title} is due ${when}.` });
    });

  // Overdue.
  active
    .filter((i) => i.overdue)
    .slice(0, 1)
    .forEach((i) => recs.push({ tone: "critical", text: `Overdue: ${i.title} is past its deadline — clear it first.` }));

  // High priority with tight time.
  active
    .filter((i) => i.priority === "High" && !i.overdue && i.remainingHours > opts.availableHours)
    .slice(0, 1)
    .forEach((i) =>
      recs.push({
        tone: "warn",
        text: `High priority: ${i.title} has ${i.remainingHours}h remaining with limited time available.`,
      })
    );

  // Over-allocated today.
  if (selectedTotal > opts.availableHours + 0.25) {
    recs.push({
      tone: "warn",
      text: `Workload warning: you've planned ${Math.round(selectedTotal * 10) / 10}h against ${opts.availableHours}h available today.`,
    });
    // Suggest moving the lowest-priority selected task's excess to tomorrow.
    const selected = active
      .filter((i) => (opts.selectedHoursByKey[i.key] ?? 0) > 0)
      .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 })[a.priority] - ({ High: 0, Medium: 1, Low: 2 })[b.priority]);
    const drop = selected[selected.length - 1];
    if (drop) {
      const excess = Math.round(Math.min(opts.selectedHoursByKey[drop.key] ?? 0, selectedTotal - opts.availableHours) * 10) / 10;
      if (excess >= 0.5) recs.push({ tone: "info", text: `Schedule suggestion: move ${excess}h of ${drop.title} to tomorrow to avoid overloading today.` });
    }
  }

  // Not enough overall capacity before deadlines.
  if (capacity.utilization > 100) {
    recs.push({
      tone: "critical",
      text: `Workload warning: your planned work this week (${capacity.activeHours}h) exceeds your ${capacity.workingHours}h available — a deadline may slip.`,
    });
  }

  // Stale progress (titles resolved by the caller from work-log freshness).
  (opts.staleTitles ?? []).slice(0, 1).forEach((title) => {
    recs.push({ tone: "info", text: `Attention needed: ${title} hasn't been updated recently.` });
  });

  return recs.slice(0, 5);
}
