import type { Department, Employee, LeaveEvent } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import { ticketsForUnit } from "@/store/tickets-store";
import {
  computeEmployeeCapacity,
  unifiedItemStatus,
  deliveryBucket,
  itemRemainingHours,
  ticketEffortForEmployee,
  isCurrentlyOnLeave,
  isOnUpcomingLeave,
  currentLeaveEvent,
  type WorkLogLookup,
  type EmployeeCapacity,
  type DisplayStatus,
  type DeliveryBucket,
} from "@/lib/capacityEngine";
import { parseLooseDate, todayStart, startOfWeek, weekOfYear } from "@/lib/date";
import { getCapacityStatus, type CapacityStatus } from "@/lib/capacity";
import { CAPACITY_THRESHOLDS } from "@/data/config";
import { getDueStatus } from "@/lib/date";
import { ticketDueLabel, adhocDueLabel } from "@/lib/due";
import { getUnitTeam } from "@/lib/hr";

export interface UnitWorkItem {
  key: string;
  employeeId: string;
  employeeName: string;
  title: string;
  dueDate: string | null;
  remainingHours: number;
  status: DisplayStatus;
  bucket: DeliveryBucket;
  progress?: number;
  ticketId?: string;
  /** The completion date, once the item is Completed. */
  completedDate: string | null;
}

export interface EmployeeCapacityRow {
  employee: Employee;
  capacity: EmployeeCapacity;
  status: CapacityStatus;
  activeItems: number;
  onLeave: "Now" | "Upcoming" | null;
}

export type AttentionTone = "critical" | "serious" | "warning" | "info" | "success";

export interface AttentionItem {
  tone: AttentionTone;
  label: string;
  message: string;
  href: string;
}

export interface DashboardSummary {
  unitEmployees: Employee[];
  teamMembers: number;
  totalAvailableHours: number;
  totalWeeklyHours: number;
  availableCapacityPct: number;
  onLeaveCount: number;
  openTicketsCount: number;
  overdueWorkCount: number;
  atRiskCount: number;
  /** Unit tickets that still have no owner — the "N Tasks Awaiting Assignment" count. */
  unassignedCount: number;
  /** Handover requests awaiting this supervisor's review — the "N Handover Requests" count. */
  pendingHandoverCount: number;
  employeeCapacities: EmployeeCapacityRow[];
  /** Drill-down lists behind each KPI card — all reflect the state as of today. */
  onLeaveToday: { employee: Employee; leave: LeaveEvent }[];
  openTickets: AssignedTicket[];
  overdueItems: UnitWorkItem[];
  atRiskItems: UnitWorkItem[];
  workItems: UnitWorkItem[];
  /** Work Delivery counts — active (non-Completed) work only, so a task drops out
   * the moment it's marked Completed. Overdue takes priority over On Hold when an
   * item is both (a passed due date is the more urgent signal). */
  workDelivery: { inProgress: number; onHold: number; overdue: number; unassigned: number };
  /** Tickets completed most recently (newest first) — powers the supervisor's
   * "task completed" indicator. */
  recentlyCompleted: AssignedTicket[];
  attentionItems: AttentionItem[];
  /** Average live utilization across the team right now — the current-period value
   * for the capacity chart. */
  teamUtilization: number;
  forecast8Week: { week: string; utilization: number }[];
}

/** A comparable "when was this last active" number for ordering — the ISO `activityAt`
 * timestamp if present, otherwise the display resolved date, otherwise 0. */
export function completionSortKey(t: AssignedTicket): number {
  if (t.activityAt) {
    const d = new Date(t.activityAt);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const r = t.resolvedDate ? parseLooseDate(t.resolvedDate) : null;
  return r ? r.getTime() : 0;
}

function buildUnitWorkItems(unitEmployees: Employee[], tickets: AssignedTicket[], getEntry: WorkLogLookup): UnitWorkItem[] {
  const items: UnitWorkItem[] = [];

  unitEmployees.forEach((e) => {
    tickets
      .filter((t) => (t.assignedEmployeeIds ?? []).includes(e.id))
      .forEach((t) => {
        const entry = getEntry(`${e.id}:${t.id}`);
        const status = unifiedItemStatus(entry.workflowStatus, t.status);
        const dueDate = ticketDueLabel(t);
        items.push({
          key: `${e.id}:${t.id}`,
          employeeId: e.id,
          employeeName: e.name,
          title: t.title,
          dueDate,
          remainingHours: itemRemainingHours(ticketEffortForEmployee(t, e.id), status === "Completed", entry.progress),
          status,
          bucket: deliveryBucket(status, dueDate),
          progress: entry.progress,
          ticketId: t.id,
          completedDate: status === "Completed" ? (t.resolvedDate ?? entry.completedAt ?? null) : null,
        });
      });

    e.adhoc.forEach((a) => {
      const entry = getEntry(`${e.id}:${a.id}`);
      const status = unifiedItemStatus(entry.workflowStatus);
      const dueDate = adhocDueLabel(a);
      items.push({
        key: `${e.id}:${a.id}`,
        employeeId: e.id,
        employeeName: e.name,
        title: a.name,
        dueDate,
        remainingHours: itemRemainingHours(a.estimatedHours, status === "Completed", entry.progress),
        status,
        bucket: deliveryBucket(status, dueDate),
        completedDate: status === "Completed" ? (entry.completedAt ?? null) : null,
        progress: entry.progress,
      });
    });
  });

  return items;
}

/** A ticket shared by 2 employees appears once per assignee in `workItems` (each
 * person legitimately needs to see it in their own workload) — but it's still one
 * ticket. Aggregate counts (Overdue Work, Team Progress, Work Delivery, Attention
 * Required) must not count it twice, so they run over this deduplicated view instead,
 * merging the assignee names for display. Ad-hoc items are never shared, so they pass
 * through unchanged. */
function dedupeByTicket(items: UnitWorkItem[]): UnitWorkItem[] {
  const byIdentity = new Map<string, UnitWorkItem>();
  const order: string[] = [];
  items.forEach((item) => {
    const identity = item.ticketId ?? item.key;
    const existing = byIdentity.get(identity);
    if (existing) {
      if (!existing.employeeName.includes(item.employeeName)) {
        existing.employeeName = `${existing.employeeName}, ${item.employeeName}`;
      }
      return;
    }
    byIdentity.set(identity, { ...item });
    order.push(identity);
  });
  return order.map((id) => byIdentity.get(id)!);
}

export function computeDashboardSummary(
  unit: Department,
  employees: Employee[],
  tickets: AssignedTicket[],
  getEntry: WorkLogLookup,
  handoverRequests: { employeeId: string; status: string }[] = []
): DashboardSummary {
  // The supervisor owns the team's capacity — they are not a team member and are
  // excluded from every count, capacity total and progress figure here.
  const unitEmployees = getUnitTeam(unit, employees);
  const workItems = buildUnitWorkItems(unitEmployees, tickets, getEntry);
  const uniqueItems = dedupeByTicket(workItems);

  const employeeCapacities: EmployeeCapacityRow[] = unitEmployees
    .map((employee) => {
      const capacity = computeEmployeeCapacity(employee, tickets, getEntry);
      const activeItems = workItems.filter((i) => i.employeeId === employee.id && i.status !== "Completed").length;
      return {
        employee,
        capacity,
        status: getCapacityStatus(capacity.utilization),
        activeItems,
        onLeave: (isCurrentlyOnLeave(employee) ? "Now" : isOnUpcomingLeave(employee) ? "Upcoming" : null) as
          | "Now"
          | "Upcoming"
          | null,
      };
    })
    // Employees currently on leave sort to the bottom — they're unavailable for assignment.
    .sort((a, b) => Number(a.capacity.onLeave) - Number(b.capacity.onLeave));
  const capacityByEmployee = new Map(employeeCapacities.map((r) => [r.employee.id, r]));

  const totalAvailableHours = Math.round(employeeCapacities.reduce((sum, r) => sum + r.capacity.availableHours, 0) * 10) / 10;
  // Denominator is the team's leave-adjusted available working hours for the week —
  // the same basis as every per-employee utilization figure.
  const totalWorkingHours = Math.round(employeeCapacities.reduce((sum, r) => sum + r.capacity.workingHours, 0) * 10) / 10;
  const totalWeeklyHours = employeeCapacities.reduce((sum, r) => sum + r.capacity.weeklyHours, 0);
  const availableCapacityPct = totalWorkingHours > 0 ? Math.round((totalAvailableHours / totalWorkingHours) * 100) : 0;

  // Today-only: employees actually on approved leave (upcoming leave still surfaces
  // separately under "Attention Required").
  const onLeaveToday = unitEmployees
    .map((employee) => {
      const leave = currentLeaveEvent(employee);
      return leave ? { employee, leave } : null;
    })
    .filter((x): x is { employee: Employee; leave: LeaveEvent } => x !== null);
  const onLeaveCount = onLeaveToday.length;

  const unitTickets = ticketsForUnit(tickets, unit);
  const openTickets = unitTickets.filter((t) => t.status !== "Completed");
  const openTicketsCount = openTickets.length;

  // Completions that happened inside WorkLens (have an activity timestamp) and were
  // owned by someone — this is what drives the supervisor's "task completed" indicator.
  const recentlyCompleted = unitTickets
    .filter((t) => t.status === "Completed" && !!t.activityAt && (t.assignedEmployeeIds ?? []).length > 0)
    .sort((a, b) => completionSortKey(b) - completionSortKey(a))
    .slice(0, 5);

  const overdueItems = uniqueItems.filter((i) => i.bucket === "Overdue");
  const overdueWorkCount = overdueItems.length;

  const atRiskItems = uniqueItems.filter((i) => {
    if (i.status === "Completed") return false;
    const row = capacityByEmployee.get(i.employeeId);
    if (row?.onLeave === "Now" || row?.onLeave === "Upcoming") return true;
    const dueSoon = i.dueDate ? getDueStatus(i.dueDate) === "Due Soon" : false;
    return dueSoon && (row?.capacity.utilization ?? 0) >= CAPACITY_THRESHOLDS.healthy.max;
  });
  const atRiskCount = atRiskItems.length;

  const activeItems = workItems.filter((i) => i.status !== "Completed");

  // Work Delivery — active (non-Completed) work only, split into the same categories
  // as the underlying item status, plus Unassigned. A completed item is excluded the
  // moment its status flips, since `uniqueItems` is recomputed from live status on
  // every render. Overdue takes priority over On Hold — a passed due date is the more
  // urgent thing to surface, whether or not the item is also paused.
  const overdueCount = uniqueItems.filter((i) => i.bucket === "Overdue").length;
  const onHoldCount = uniqueItems.filter((i) => i.status === "On Hold" && i.bucket !== "Overdue").length;
  const inProgressCount = uniqueItems.filter((i) => i.status === "In Progress" && i.bucket !== "Overdue").length;
  const unassignedCount = openTickets.filter((t) => (t.assignedEmployeeIds ?? []).length === 0).length;
  const workDelivery = {
    inProgress: inProgressCount,
    onHold: onHoldCount,
    overdue: overdueCount,
    unassigned: unassignedCount,
  };
  const pendingHandoverCount = handoverRequests.filter(
    (r) => r.status === "Pending Supervisor Review" && unitEmployees.some((e) => e.id === r.employeeId)
  ).length;

  const attentionItems: AttentionItem[] = [];
  const itemHref = (i: UnitWorkItem) => (i.ticketId ? `/systems/tickets/${i.ticketId}` : `/supervisor/people/${i.employeeId}`);

  uniqueItems
    .filter((i) => i.bucket === "Overdue")
    .slice(0, 2)
    .forEach((i) =>
      attentionItems.push({
        tone: "critical",
        label: "Critical",
        message: `${i.title} is overdue and likely to miss its deadline.`,
        href: itemHref(i),
      })
    );

  // A clear indicator that team members have completed work — surfaced near the top
  // so it isn't crowded out.
  recentlyCompleted.slice(0, 2).forEach((t) => {
    const names = (t.assignedEmployeeIds ?? [])
      .map((id) => unitEmployees.find((e) => e.id === id)?.name)
      .filter(Boolean)
      .join(" & ");
    attentionItems.push({
      tone: "success",
      label: "Completed",
      message: `${t.title} was marked complete${names ? ` by ${names}` : ""}.`,
      href: "/supervisor/work",
    });
  });

  employeeCapacities
    .filter((r) => r.capacity.utilization >= CAPACITY_THRESHOLDS.atRisk.max)
    .slice(0, 2)
    .forEach((r) =>
      attentionItems.push({
        tone: "serious",
        label: "Capacity Risk",
        message: `${r.employee.name} is approaching full capacity (${r.capacity.utilization}% utilized).`,
        href: `/supervisor/people/${r.employee.id}`,
      })
    );

  employeeCapacities
    .filter((r) => r.onLeave === "Upcoming" && r.activeItems > 0)
    .slice(0, 2)
    .forEach((r) =>
      attentionItems.push({
        tone: "warning",
        label: "Upcoming Leave",
        message: `${r.employee.name} will be unavailable while ${r.activeItems} work item${r.activeItems === 1 ? " is" : "s are"} active.`,
        href: "/supervisor/handover",
      })
    );

  uniqueItems
    .filter((i) => i.status === "On Hold")
    .slice(0, 2)
    .forEach((i) =>
      attentionItems.push({
        tone: "info",
        label: "On Hold",
        message: `${i.title} (${i.employeeName}) is on hold.`,
        href: itemHref(i),
      })
    );

  const forecastWeekStart = startOfWeek(todayStart());
  const forecast8Week = Array.from({ length: 8 }, (_, weekIdx) => {
    const values = unitEmployees.map((e) => e.forecast8Week[weekIdx] ?? e.currentUtilization);
    const avg = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
    // App-wide Sunday-based 1–52 week numbering.
    const weekDate = new Date(
      forecastWeekStart.getFullYear(),
      forecastWeekStart.getMonth(),
      forecastWeekStart.getDate() + weekIdx * 7
    );
    return { week: `Week ${weekOfYear(weekDate)}`, utilization: avg };
  });

  const teamUtilization = employeeCapacities.length
    ? Math.round(employeeCapacities.reduce((sum, r) => sum + r.capacity.utilization, 0) / employeeCapacities.length)
    : 0;

  return {
    unitEmployees,
    teamMembers: unitEmployees.length,
    totalAvailableHours,
    totalWeeklyHours,
    availableCapacityPct,
    onLeaveCount,
    openTicketsCount,
    overdueWorkCount,
    atRiskCount,
    employeeCapacities,
    onLeaveToday,
    openTickets,
    overdueItems,
    atRiskItems,
    unassignedCount,
    pendingHandoverCount,
    workItems: activeItems,
    workDelivery,
    recentlyCompleted,
    attentionItems: attentionItems.slice(0, 6),
    teamUtilization,
    forecast8Week,
  };
}
