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

import type { Employee, LeaveEvent, WorkflowStatus } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import type { TicketStatus } from "@/data/tickets";
import { todayStart, parseLooseDate, getDueStatus } from "@/lib/date";
import { ticketDueLabel, adhocDueLabel } from "@/lib/due";

export interface WorkLogLookup {
  (key: string): { workflowStatus?: WorkflowStatus; progress?: number };
}

/** A task is done once it's Completed on the ticket itself (the supervisor's or IT
 * Ticket System's call) OR the assignee has marked their personal tracking Completed —
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

export interface EmployeeCapacity {
  /** Contracted weekly hours from HR. */
  weeklyHours: number;
  /** Available working hours for the current week — `weeklyHours` reduced pro-rata
   * for any approved leave days that fall in the week. This is the denominator for
   * every utilization/availability figure in the app. */
  workingHours: number;
  /** Remaining workload hours across active assigned work (progress and completion
   * already applied). */
  activeHours: number;
  /** `workingHours − activeHours`, floored at 0 — spare capacity in hours. */
  availableHours: number;
  /** `activeHours ÷ workingHours × 100`, rounded. */
  utilization: number;
}

/** Working days (Sun–Thu; Fri/Sat are the weekend) in the calendar week that
 * contains `ref`. */
function currentWeekBounds(ref: Date): { start: Date; end: Date } {
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - ref.getDay());
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
  let activeHours = 0;

  tickets
    .filter((t) => (t.assignedEmployeeIds ?? []).includes(employee.id))
    .forEach((t) => {
      const entry = getEntry(`${employee.id}:${t.id}`);
      const effort = ticketEffortForEmployee(t, employee.id);
      activeHours += itemRemainingHours(effort, isItemComplete(entry.workflowStatus, t.status), entry.progress);
    });

  employee.adhoc.forEach((a) => {
    const entry = getEntry(`${employee.id}:${a.id}`);
    activeHours += itemRemainingHours(a.estimatedHours, isItemComplete(entry.workflowStatus), entry.progress);
  });

  activeHours = Math.round(activeHours * 10) / 10;
  const weeklyHours = employee.weeklyHours || 40;
  const workingHours = weeklyWorkingHours(employee);
  // On leave the whole week: keep the ratio finite by falling back to contracted hours.
  const denom = workingHours > 0 ? workingHours : weeklyHours;
  return {
    weeklyHours,
    workingHours,
    activeHours,
    availableHours: Math.max(0, Math.round((workingHours - activeHours) * 10) / 10),
    utilization: Math.round((activeHours / denom) * 100),
  };
}

/** Resulting utilization if `extraHours` of new work were added to `employee` —
 * uses the exact same formula as `computeEmployeeCapacity` so the assignment
 * warning and the dashboards can never disagree. */
export function projectedUtilization(
  employee: Employee,
  tickets: AssignedTicket[],
  getEntry: WorkLogLookup,
  extraHours: number
): number {
  const { activeHours, workingHours, weeklyHours } = computeEmployeeCapacity(employee, tickets, getEntry);
  const denom = workingHours > 0 ? workingHours : weeklyHours;
  return Math.round(((activeHours + Math.max(0, extraHours)) / denom) * 100);
}

export interface EmployeeWorkItem {
  key: string;
  title: string;
  type: "Ticket" | "Ad-hoc";
  dueDate: string | null;
  status: DisplayStatus;
  progress: number;
  remainingHours: number;
  ticketId?: string;
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
      items.push({
        key: `${employee.id}:${t.id}`,
        title: t.title,
        type: "Ticket",
        dueDate: ticketDueLabel(t),
        status,
        progress: status === "Completed" ? 100 : Math.min(100, Math.max(0, entry.progress ?? 0)),
        remainingHours: itemRemainingHours(ticketEffortForEmployee(t, employee.id), status === "Completed", entry.progress),
        ticketId: t.id,
      });
    });

  employee.adhoc.forEach((a) => {
    const entry = getEntry(`${employee.id}:${a.id}`);
    const status = unifiedItemStatus(entry.workflowStatus);
    items.push({
      key: `${employee.id}:${a.id}`,
      title: a.name,
      type: "Ad-hoc",
      dueDate: adhocDueLabel(a),
      status,
      progress: status === "Completed" ? 100 : Math.min(100, Math.max(0, entry.progress ?? 0)),
      remainingHours: itemRemainingHours(a.estimatedHours, status === "Completed", entry.progress),
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
