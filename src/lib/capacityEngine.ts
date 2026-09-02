// The one shared source of truth for "how busy is this employee right now" and "is this
// work item done, blocked, or at risk" — used by the Supervisor Dashboard, Team Capacity,
// and the employee capacity pages alike, so they can never disagree with each other.
//
// Architecture note: rather than making every consumer (ticket-candidate ranking, the
// Handover/What-If simulators, Team Capacity's table/card views, StatusBadge colors, ...)
// recompute this independently, `CapacitySyncEngine` (mounted once at the app root) is the
// only thing that WRITES the result back onto `Employee.currentUtilization` — every other
// page keeps reading that same stored field exactly as before. That keeps this fix scoped
// to "make the number correct and keep it correct" rather than a rewrite of every page that
// happens to read utilization.

import type { AdhocItem, Employee, LeaveEvent, WorkflowStatus } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import type { TicketStatus } from "@/data/tickets";
import {
  todayStart,
  parseLooseDate,
  getDueStatus,
  startOfWeek,
  resolveDueDate,
  dateKey,
  dateFromKey,
  isWorkingDay,
} from "@/lib/date";
import { ticketDueLabel, adhocDueLabel } from "@/lib/due";
import { availableCapacity } from "@/lib/capacity";

export interface WorkLogLookup {
  (key: string): {
    workflowStatus?: WorkflowStatus;
    progress?: number;
    completedAt?: string | null;
    holdStartDate?: string | null;
    holdEndDate?: string | null;
  };
}

/** A task is done once it's Completed on the ticket itself (the supervisor's or
 * IT-Demand's call) OR the assignee has marked their personal tracking Completed —
 * either should free up their capacity. Ad-hoc items have no system-of-record status of
 * their own, so only the work-log's Completed applies. */
export function isItemComplete(workflowStatus: WorkflowStatus | undefined, ticketStatus?: TicketStatus): boolean {
  if (workflowStatus === "Completed") return true;
  if (ticketStatus === "Completed") return true;
  return false;
}

/** The share of a ticket's estimated effort that falls on `employeeId`. A solo owner
 * carries the whole estimate; co-owners share it per the ticket's `effortSplit`, or
 * evenly when no split is set. Keeps both employees' capacity consistent with the
 * task's total effort. */
export function ticketEffortForEmployee(
  ticket: { estimatedHours: number; assignedEmployeeIds?: string[]; effortSplit?: Record<string, number> },
  employeeId: string
): number {
  const ids = ticket.assignedEmployeeIds ?? [];
  if (ids.length <= 1) return ticket.estimatedHours;
  const split = ticket.effortSplit;
  if (split && typeof split[employeeId] === "number") return split[employeeId];
  return Math.round((ticket.estimatedHours / ids.length) * 10) / 10;
}

/** Remaining effort for one work item — the full estimate once progress/completion is
 * factored in. Completed work is always 0h remaining regardless of a stale progress value. */
export function itemRemainingHours(estimatedHours: number, complete: boolean, progress: number | undefined): number {
  if (complete) return 0;
  const pct = Math.min(100, Math.max(0, progress ?? 0));
  return Math.round(estimatedHours * (1 - pct / 100) * 10) / 10;
}

/** When work on an item is assumed to start — the ticket's raised date if it's already
 * passed, otherwise today. Ad-hoc items have no raised date, so they start today. */
export function itemStartDate(raisedDate?: string | null): Date {
  const today = todayStart();
  const raised = raisedDate ? parseLooseDate(raisedDate) : null;
  return raised && raised < today ? raised : today;
}

/** True when an approved leave event covers `date`. */
export function isOnLeaveDate(employee: Employee, date: Date): boolean {
  return employee.leaveEvents.some((l) => {
    if (l.status === "Pending") return false;
    const s = parseLooseDate(l.start);
    const e = parseLooseDate(l.end);
    return !!s && !!e && date >= s && date <= e;
  });
}

/**
 * The working days across which an item's remaining effort is spread: every day from
 * `from` up to and including the `deadline` that is a working day (Sun–Thu) **and** not
 * an approved-leave day for this employee. Returns `YYYY-MM-DD` keys.
 *
 * Empty when the deadline has already passed relative to `from` — the caller collapses
 * that onto "due now" (see `DUE_NOW`).
 */
export function scheduledWorkingDayKeys(from: Date, deadline: Date, employee: Employee): string[] {
  const keys: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const last = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  let guard = 0;
  while (cursor <= last && guard < 1000) {
    guard += 1;
    if (isWorkingDay(cursor) && !isOnLeaveDate(employee, cursor)) keys.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** Approved-leave working days for `employee` that fall within `[start, end]`. */
export function leaveWorkingDaysBetween(employee: Employee, start: Date, end: Date): number {
  if (start > end) return 0;
  let days = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last) {
    if (isWorkingDay(cursor) && isOnLeaveDate(employee, cursor)) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// ============================================================================
// Task schedule — the ONE model of "which hours of which task land on which day".
// Every deadline-driven number in WorkLens (employee capacity, team capacity,
// assignment projections, the Daily Tasks view, the calendar) is derived from this
// so no screen can drift onto its own scheduling maths.
//
//   Estimated Task Hours ÷ Available Working Days Until Deadline = Daily Required Hours
//
// where "available working days" excludes weekends, approved leave, and days before
// the task's start/assignment date. An explicit deadline always wins; with none, the
// priority's SLA window stands in (High 24h / Medium 1 week / Low 1 month).
// ============================================================================

export interface ScheduledWorkItem {
  key: string;
  title: string;
  type: "Ticket" | "Ad-hoc";
  ticketId?: string;
  priority: "High" | "Medium" | "Low";
  /** In Progress / On Hold — Completed items are never scheduled. */
  status: "In Progress" | "On Hold";
  /** In Progress and past its deadline. Still distributed (collapsed onto today). */
  overdue: boolean;
  remainingHours: number;
  totalHours: number;
  progress: number;
  startDate: Date;
  deadline: Date;
  /** `YYYY-MM-DD` keys the remaining effort is spread across. Empty for On Hold. */
  workingDayKeys: string[];
  /** `remainingHours ÷ workingDayKeys.length` — the even per-day distribution.
   * 0 for On Hold. */
  dailyHours: number;
}

export interface DayAllocation {
  item: ScheduledWorkItem;
  hours: number;
}

export interface EmployeeDayPlan {
  date: Date;
  key: string;
  /** e.g. "Monday". */
  weekdayLabel: string;
  isToday: boolean;
  /** A working day (Sun–Thu) that is not an approved-leave day. */
  isWorkingDay: boolean;
  onLeave: boolean;
  allocations: DayAllocation[];
  totalHours: number;
}

export interface EmployeeSchedule {
  employeeId: string;
  /** All non-completed items (In Progress + On Hold). */
  items: ScheduledWorkItem[];
  /** In Progress items only — the ones with a live daily distribution. */
  activeItems: ScheduledWorkItem[];
  /** Allocations landing on one day. */
  allocationsForDay: (key: string) => DayAllocation[];
  /** The next `workingDays` working days from `from` (inclusive), each with its
   * planned tasks and total planned hours. Non-working days in between are skipped. */
  planForRange: (from: Date, workingDays: number) => EmployeeDayPlan[];
  /** Deadline-driven hours landing in the current (Sunday-based) week — the value
   * `computeEmployeeCapacity` turns into utilization. */
  weeklyScheduledHours: number;
}

function buildScheduledItem(params: {
  key: string;
  title: string;
  type: "Ticket" | "Ad-hoc";
  ticketId?: string;
  priority: "High" | "Medium" | "Low";
  status: "In Progress" | "On Hold";
  remainingHours: number;
  totalHours: number;
  progress: number;
  startDate: Date;
  deadline: Date;
  employee: Employee;
}): ScheduledWorkItem {
  const { employee, ...rest } = params;
  const { status, remainingHours, startDate, deadline } = rest;
  const today = todayStart();
  const from = startDate > today ? startDate : today;

  if (status === "On Hold" || remainingHours <= 0) {
    return { ...rest, overdue: false, workingDayKeys: [], dailyHours: 0 };
  }

  let workingDayKeys = deadline < from ? [] : scheduledWorkingDayKeys(from, deadline, employee);
  const overdue = deadline < today;
  // Overdue, or no working days left before the deadline (e.g. deadline is a weekend
  // or falls entirely inside leave) → the whole remaining effort is needed today.
  if (workingDayKeys.length === 0) workingDayKeys = [dateKey(today)];

  const dailyHours = Math.round((remainingHours / workingDayKeys.length) * 100) / 100;
  return { ...rest, overdue, workingDayKeys, dailyHours };
}

/** The task schedule for one employee — see the block comment above. */
export function computeEmployeeSchedule(
  employee: Employee,
  tickets: AssignedTicket[],
  getEntry: WorkLogLookup
): EmployeeSchedule {
  const items: ScheduledWorkItem[] = [];

  tickets
    .filter((t) => (t.assignedEmployeeIds ?? []).includes(employee.id))
    .forEach((t) => {
      const entry = getEntry(`${employee.id}:${t.id}`);
      const status = unifiedItemStatus(entry.workflowStatus, t.status);
      if (status === "Completed") return;
      const effort = ticketEffortForEmployee(t, employee.id);
      const remaining = itemRemainingHours(effort, false, entry.progress);
      items.push(
        buildScheduledItem({
          key: `${employee.id}:${t.id}`,
          title: t.title,
          type: "Ticket",
          ticketId: t.id,
          priority: t.priority,
          status,
          remainingHours: remaining,
          totalHours: effort,
          progress: Math.min(100, Math.max(0, entry.progress ?? 0)),
          startDate: itemStartDate(t.raisedDate),
          deadline: resolveDueDate(t.expectedResolutionDate, t.priority, t.raisedDate),
          employee,
        })
      );
    });

  employee.adhoc.forEach((a) => {
    const entry = getEntry(`${employee.id}:${a.id}`);
    const status = unifiedItemStatus(entry.workflowStatus);
    if (status === "Completed") return;
    const remaining = itemRemainingHours(a.estimatedHours, false, entry.progress);
    // No explicit deadline → SLA window from today establishes the schedule.
    const deadline = resolveDueDate(a.deadline === "Ongoing" ? null : a.deadline, a.priority);
    items.push(
      buildScheduledItem({
        key: `${employee.id}:${a.id}`,
        title: a.name,
        type: "Ad-hoc",
        priority: a.priority,
        status,
        remainingHours: remaining,
        totalHours: a.estimatedHours,
        progress: Math.min(100, Math.max(0, entry.progress ?? 0)),
        startDate: todayStart(),
        deadline,
        employee,
      })
    );
  });

  const activeItems = items.filter((i) => i.status === "In Progress");

  const byDay = new Map<string, DayAllocation[]>();
  activeItems.forEach((item) => {
    item.workingDayKeys.forEach((k) => {
      const list = byDay.get(k) ?? [];
      list.push({ item, hours: item.dailyHours });
      byDay.set(k, list);
    });
  });

  const allocationsForDay = (key: string) => byDay.get(key) ?? [];

  const planForRange = (from: Date, workingDays: number): EmployeeDayPlan[] => {
    const plans: EmployeeDayPlan[] = [];
    const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const today = todayStart();
    let guard = 0;
    while (plans.length < workingDays && guard < 400) {
      guard += 1;
      const working = isWorkingDay(cursor);
      const onLeave = isOnLeaveDate(employee, cursor);
      if (working) {
        const key = dateKey(cursor);
        const allocations = allocationsForDay(key);
        plans.push({
          date: new Date(cursor),
          key,
          weekdayLabel: cursor.toLocaleDateString("en-US", { weekday: "long" }),
          isToday: cursor.getTime() === today.getTime(),
          isWorkingDay: working && !onLeave,
          onLeave,
          allocations,
          totalHours: Math.round(allocations.reduce((s, a) => s + a.hours, 0) * 10) / 10,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return plans;
  };

  // Hours landing in the current Sunday-based week — sum each active item's daily
  // distribution over the days it's scheduled that fall in this week.
  const { start: weekStart, end: weekEnd } = currentWeekBounds(todayStart());
  let weeklyScheduledHours = 0;
  activeItems.forEach((item) => {
    const inWeek = item.workingDayKeys.filter((k) => {
      const d = dateFromKey(k);
      return d >= weekStart && d <= weekEnd;
    }).length;
    weeklyScheduledHours += item.dailyHours * inWeek;
  });
  weeklyScheduledHours = Math.round(weeklyScheduledHours * 10) / 10;

  return { employeeId: employee.id, items, activeItems, allocationsForDay, planForRange, weeklyScheduledHours };
}

/**
 * The effort (hours) one work item places on an employee **in the current week**,
 * driven by its deadline — the same even day-by-day distribution the Daily Tasks view
 * shows, summed over this week's working days. Used for assignment projections where a
 * full `computeEmployeeSchedule` isn't to hand.
 */
export function weeklyRequiredHoursForItem(
  remainingHours: number,
  start: Date,
  due: Date,
  employee: Employee
): number {
  if (remainingHours <= 0) return 0;
  const today = todayStart();
  const from = start > today ? start : today;
  let keys = due < from ? [] : scheduledWorkingDayKeys(from, due, employee);
  if (keys.length === 0) keys = [dateKey(today)];
  const perDay = remainingHours / keys.length;
  const { start: weekStart, end: weekEnd } = currentWeekBounds(today);
  const inWeek = keys.filter((k) => {
    const d = dateFromKey(k);
    return d >= weekStart && d <= weekEnd;
  }).length;
  return Math.round(perDay * inWeek * 10) / 10;
}

/** The deadline-driven weekly load for one assigned ticket on `employee`. */
export function ticketWeeklyRequiredHours(ticket: AssignedTicket, employee: Employee, remainingHours: number): number {
  const due = resolveDueDate(ticket.expectedResolutionDate, ticket.priority, ticket.raisedDate);
  return weeklyRequiredHoursForItem(remainingHours, itemStartDate(ticket.raisedDate), due, employee);
}

/** The deadline-driven weekly load for one ad-hoc item — its SLA window stands in for
 * the missing deadline. */
export function adhocWeeklyRequiredHours(item: AdhocItem, employee: Employee, remainingHours: number): number {
  if (remainingHours <= 0) return 0;
  const due = resolveDueDate(item.deadline === "Ongoing" ? null : item.deadline, item.priority);
  return weeklyRequiredHoursForItem(remainingHours, todayStart(), due, employee);
}

export interface EmployeeCapacity {
  /** Contracted weekly hours from HR. */
  weeklyHours: number;
  /** Available working hours for the current week — `weeklyHours` reduced pro-rata
   * for any approved leave days that fall in the week, and forced to 0 while the
   * employee is currently on leave. This is the denominator for every
   * utilization/availability figure in the app. */
  workingHours: number;
  /** Deadline-driven workload hours for the **current week** — for each active item,
   * its remaining effort spread across the working days between its start date and its
   * deadline (an explicit deadline always wins; the SLA window only stands in when
   * there is none), scaled to a week. This is what utilization and capacity are built
   * on. On Hold and Completed work contribute 0 (see `unifiedItemStatus`). */
  activeHours: number;
  /** Total remaining effort across active assigned work, irrespective of deadline —
   * the raw "hours left to do" figure, for display where a plain total is wanted
   * (e.g. "Total Workload"). Not used for utilization. */
  totalRemainingHours: number;
  /** Spare capacity in hours — `workingHours − activeHours`, floored at 0, and
   * exactly 0 while the employee is currently on leave. */
  availableHours: number;
  /** `activeHours ÷ workingHours × 100`, rounded — the workload figure. Unaffected
   * by leave (someone on leave can still have work assigned that needs covering). */
  utilization: number;
  /** Availability as a percentage — `100 − utilization`, floored at 0, and exactly
   * 0 while the employee is currently on leave (they are unavailable for assignment,
   * not "100% free"). Use this, never `100 − utilization`, for any "available %". */
  availablePercent: number;
  /** True when an approved leave event covers today — the employee is unavailable. */
  onLeave: boolean;
}

/** Working days (Sun–Thu; Fri/Sat are the weekend) in the calendar week that
 * contains `ref` — Sunday-based, matching the app-wide week scheme (`startOfWeek`
 * in lib/date). */
function currentWeekBounds(ref: Date): { start: Date; end: Date } {
  const start = startOfWeek(ref);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start, end };
}

/** Approved-leave working days that fall within `employee`'s current week. */
export function leaveWorkingDaysThisWeek(employee: Employee): number {
  const { start, end } = currentWeekBounds(todayStart());
  const ranges = employee.leaveEvents
    .filter((l) => l.status !== "Pending")
    .map((l) => ({ s: parseLooseDate(l.start), e: parseLooseDate(l.end) }))
    .filter((r): r is { s: Date; e: Date } => !!r.s && !!r.e);
  let days = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day === 5 || day === 6) continue;
    if (ranges.some((r) => d >= r.s && d <= r.e)) days += 1;
  }
  return days;
}

/** Available working hours for `employee` this week — contracted weekly hours minus
 * the pro-rata hours lost to approved leave that falls in the week. The single
 * source of truth for the capacity denominator. */
export function weeklyWorkingHours(employee: Employee): number {
  const weekly = employee.weeklyHours || 40;
  const perDay = weekly / 5;
  return Math.max(0, Math.round((weekly - leaveWorkingDaysThisWeek(employee) * perDay) * 10) / 10);
}

/** Every ticket assigned to `employee` (live tickets-store data) plus their seed ad-hoc
 * items, reduced by logged progress and zeroed out once complete. `upcomingTickets` (a
 * seed duplicate of the ticket concept, superseded by the live tickets store) is
 * deliberately excluded so real tickets aren't counted twice under two systems. */
export function computeEmployeeCapacity(employee: Employee, tickets: AssignedTicket[], getEntry: WorkLogLookup): EmployeeCapacity {
  // One schedule, one set of numbers. On Hold / Completed work is not "active" and
  // contributes nothing to this week's load (`activeItems` is In Progress only).
  const schedule = computeEmployeeSchedule(employee, tickets, getEntry);
  const activeHours = schedule.weeklyScheduledHours;
  const totalRemainingHours =
    Math.round(schedule.activeItems.reduce((sum, i) => sum + i.remainingHours, 0) * 10) / 10;
  const weeklyHours = employee.weeklyHours || 40;
  const onLeave = isCurrentlyOnLeave(employee);
  // Currently on leave → no working hours and no availability, regardless of how the
  // rest of the week looks. Otherwise it's the leave-adjusted weekly figure.
  const workingHours = onLeave ? 0 : weeklyWorkingHours(employee);
  // Keep the ratio finite when there are no working hours (full-week leave or an
  // unusual schedule) by falling back to contracted hours for the denominator only.
  const denom = workingHours > 0 ? workingHours : weeklyHours;
  const utilization = Math.round((activeHours / denom) * 100);
  return {
    weeklyHours,
    workingHours,
    activeHours,
    totalRemainingHours,
    availableHours: onLeave ? 0 : Math.max(0, Math.round((workingHours - activeHours) * 10) / 10),
    utilization,
    availablePercent: onLeave ? 0 : availableCapacity(utilization),
    onLeave,
  };
}

/** The availability percentage to display for an employee wherever the app reads the
 * synced `currentUtilization` field directly (rather than a full `EmployeeCapacity`).
 * Zero while on leave; otherwise `100 − utilization`. */
export function employeeAvailablePercent(employee: Employee): number {
  return isCurrentlyOnLeave(employee) ? 0 : availableCapacity(employee.currentUtilization);
}

/** Resulting utilization if `extraWeeklyHours` of new weekly load were added to
 * `employee` — uses the exact same formula as `computeEmployeeCapacity` so the
 * assignment warning and the dashboards can never disagree. `extraWeeklyHours` is a
 * per-week figure (the deadline-driven weekly load of the new work), not a raw estimate. */
export function projectedUtilization(
  employee: Employee,
  tickets: AssignedTicket[],
  getEntry: WorkLogLookup,
  extraWeeklyHours: number
): number {
  const { activeHours, workingHours, weeklyHours } = computeEmployeeCapacity(employee, tickets, getEntry);
  const denom = workingHours > 0 ? workingHours : weeklyHours;
  return Math.round(((activeHours + Math.max(0, extraWeeklyHours)) / denom) * 100);
}

/** Resulting utilization if `employee` picked up `ticket` — the ticket's deadline-driven
 * weekly load added on top of their current capacity. Already-assigned tickets add nothing.
 * The single calculation behind every "After Assignment: N%" figure in the app. */
export function projectedUtilizationForTicket(
  employee: Employee,
  tickets: AssignedTicket[],
  getEntry: WorkLogLookup,
  ticket: AssignedTicket
): number {
  const currentIds = ticket.assignedEmployeeIds ?? [];
  if (currentIds.includes(employee.id)) return computeEmployeeCapacity(employee, tickets, getEntry).utilization;
  // Effort this employee would carry: whole estimate as sole owner, half if joining
  // someone already on it (the assign flows here replace, not co-assign, but be safe).
  const effort = currentIds.length >= 1 ? Math.round((ticket.estimatedHours / 2) * 10) / 10 : ticket.estimatedHours;
  const extra = ticketWeeklyRequiredHours(ticket, employee, effort);
  return projectedUtilization(employee, tickets, getEntry, extra);
}

export interface EmployeeWorkItem {
  key: string;
  title: string;
  type: "Ticket" | "Ad-hoc";
  dueDate: string | null;
  status: DisplayStatus;
  progress: number;
  remainingHours: number;
  /** Deadline-driven effort this item places on the current week (0 unless In Progress). */
  weeklyRequiredHours: number;
  ticketId?: string;
  /** Set once the item is Completed — its completion date. Null otherwise. */
  completedDate: string | null;
  /** The hold window, when the item is On Hold. */
  holdStart: string | null;
  holdEnd: string | null;
}

/** Every active-or-completed work item on `employee`'s plate, in the same shape
 * whether it's a live ticket or a seed ad-hoc item — used for both the "my work"
 * lists (My Work, MyWorkList) and the small KPI counts (Active Work, Overdue, Due
 * Soon) that need to agree with each other and with `computeEmployeeCapacity`. */
export function computeEmployeeWorkItems(employee: Employee, tickets: AssignedTicket[], getEntry: WorkLogLookup): EmployeeWorkItem[] {
  const items: EmployeeWorkItem[] = [];

  tickets
    .filter((t) => (t.assignedEmployeeIds ?? []).includes(employee.id))
    .forEach((t) => {
      const entry = getEntry(`${employee.id}:${t.id}`);
      const status = unifiedItemStatus(entry.workflowStatus, t.status);
      const remaining = itemRemainingHours(ticketEffortForEmployee(t, employee.id), status === "Completed", entry.progress);
      items.push({
        key: `${employee.id}:${t.id}`,
        title: t.title,
        type: "Ticket",
        dueDate: ticketDueLabel(t),
        status,
        progress: status === "Completed" ? 100 : Math.min(100, Math.max(0, entry.progress ?? 0)),
        remainingHours: remaining,
        weeklyRequiredHours: status === "In Progress" ? ticketWeeklyRequiredHours(t, employee, remaining) : 0,
        ticketId: t.id,
        completedDate: status === "Completed" ? (t.resolvedDate ?? entry.completedAt ?? null) : null,
        holdStart: status === "On Hold" ? (t.holdStartDate ?? entry.holdStartDate ?? null) : null,
        holdEnd: status === "On Hold" ? (t.holdEndDate ?? entry.holdEndDate ?? null) : null,
      });
    });

  employee.adhoc.forEach((a) => {
    const entry = getEntry(`${employee.id}:${a.id}`);
    const status = unifiedItemStatus(entry.workflowStatus);
    const remaining = itemRemainingHours(a.estimatedHours, status === "Completed", entry.progress);
    items.push({
      key: `${employee.id}:${a.id}`,
      title: a.name,
      type: "Ad-hoc",
      dueDate: adhocDueLabel(a),
      status,
      progress: status === "Completed" ? 100 : Math.min(100, Math.max(0, entry.progress ?? 0)),
      remainingHours: remaining,
      weeklyRequiredHours: status === "In Progress" ? adhocWeeklyRequiredHours(a, employee, remaining) : 0,
      completedDate: status === "Completed" ? (entry.completedAt ?? null) : null,
      holdStart: status === "On Hold" ? (entry.holdStartDate ?? null) : null,
      holdEnd: status === "On Hold" ? (entry.holdEndDate ?? null) : null,
    });
  });

  return items;
}

export type DisplayStatus = "In Progress" | "On Hold" | "Completed";

/** A single, unified status for any work item — ticket or ad-hoc — for status rollups
 * (Team Progress, Work Delivery) that don't care which system the item came from.
 * Only the three app-wide states. Work with no status yet counts as In Progress. */
export function unifiedItemStatus(workflowStatus: WorkflowStatus | undefined, ticketStatus?: TicketStatus): DisplayStatus {
  if (isItemComplete(workflowStatus, ticketStatus)) return "Completed";
  if (workflowStatus === "On Hold" || ticketStatus === "On Hold") return "On Hold";
  return "In Progress";
}

export type DeliveryBucket = "Completed" | "Overdue" | "In Progress";

/** Where a work item lands on the "are we actually delivering" view — a passed due
 * date is the one signal that overrides everything else, since it's true regardless
 * of whether the item is also logged as blocked. Blocked status has its own visibility
 * in Team Progress, so it isn't split out again here. */
export function deliveryBucket(status: DisplayStatus, dueDate: string | null | undefined): DeliveryBucket {
  if (status === "Completed") return "Completed";
  if (dueDate && getDueStatus(dueDate) === "Overdue") return "Overdue";
  return "In Progress";
}

/** A rough, per-item "how done is it" fraction used for the team's overall progress
 * average — real logged progress when we have it, otherwise a status-based estimate. */
export function progressFraction(status: DisplayStatus, progress: number | undefined): number {
  if (status === "Completed") return 100;
  if (typeof progress === "number") return Math.min(100, Math.max(0, progress));
  if (status === "On Hold") return 25;
  return 50;
}

function rangesOverlapToday(start: string, end: string): boolean {
  const s = parseLooseDate(start);
  const e = parseLooseDate(end);
  if (!s || !e) return false;
  const today = todayStart();
  return today >= s && today <= e;
}

export function isCurrentlyOnLeave(employee: Employee): boolean {
  return employee.leaveEvents.some((l) => l.status !== "Pending" && rangesOverlapToday(l.start, l.end));
}

/** The approved leave event covering today, if any — used to show *why* someone counts
 * as on leave (type and dates) in the dashboard drill-down. */
export function currentLeaveEvent(employee: Employee): LeaveEvent | null {
  return employee.leaveEvents.find((l) => l.status !== "Pending" && rangesOverlapToday(l.start, l.end)) ?? null;
}

/** Leave starting soon enough to matter for near-term planning — a supervisor deciding
 * who to assign new work to this week needs to know about next week's leave too. */
export function isOnUpcomingLeave(employee: Employee, withinDays = 7): boolean {
  return employee.leaveEvents.some((l) => {
    if (l.status === "Pending") return false;
    const start = parseLooseDate(l.start);
    if (!start) return false;
    const msPerDay = 24 * 60 * 60 * 1000;
    const days = Math.round((start.getTime() - todayStart().getTime()) / msPerDay);
    return days >= 0 && days <= withinDays;
  });
}

export function isOnOrUpcomingLeave(employee: Employee, withinDays = 7): boolean {
  return isCurrentlyOnLeave(employee) || isOnUpcomingLeave(employee, withinDays);
}
