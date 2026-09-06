// Calculation engine behind the Handover & Continuity Planner. Pure functions only (no
// React) so the page and its sub-components can stay focused on rendering.
//
// The app's data model has no "Project"/Flow/SDLC system at all — tickets are the one
// system-of-record work type. `adhoc` on Employee is the seed-driven ad-hoc workload
// picture already shown elsewhere (supervisor's employee-detail page, MyWorkList), so
// it's folded in too. `upcomingTickets` (a seed duplicate of the ticket concept) is
// skipped to avoid double-counting a unit's real tickets under two different systems.
//
// Turnover coverage is TIME-BOXED: the covering employee carries a ticket's planned
// days only for the owner's leave window, at the owner's own per-day rate — read
// straight from the owner's REAL schedule (`itemHoursInRange` in capacityEngine), which
// already accounts for the owner's other work, calendar events and room-aware
// distribution. Candidates are weighed against their availability, leave, calendar
// events and existing scheduled workload (including any coverage already selected
// elsewhere in this same turnover plan) ON THE LEAVE DATES — not on today.

import type { Employee, Skill } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import type { TicketCoverage } from "@/data/tickets";
import type { CalendarEvent } from "@/store/calendar-events-store";
import {
  todayStart,
  parseLooseDate,
  dateFromKey,
  getDueStatus,
  resolveDueDate,
  formatDisplayDate,
  addDays,
  daysBetween,
  countWorkingDays,
} from "@/lib/date";
import { ticketDueLabel, adhocDueLabel } from "@/lib/due";
import {
  ticketEffortForEmployee,
  itemStartDate,
  itemRemainingHours,
  leaveWorkingDaysBetween,
  calendarEventHoursBetween,
  computeEmployeeSchedule,
  itemHoursInRange,
  scheduledHoursBetween,
  isOnLeaveDate,
  type WorkLogLookup,
} from "@/lib/capacityEngine";
import { computeSkillMatch } from "@/lib/simulate";
import { OVERLOAD_THRESHOLD } from "@/data/config";

// Re-exported so existing importers (`@/lib/absenceImpact`) keep working — the shared
// definitions now live in `@/lib/date`.
export { addDays, daysBetween, countWorkingDays };

export type WorkItemType = "Ticket" | "Ad-hoc";
export type DeadlineStatus = "Overdue" | "Approaching" | "On Track";
export type RiskLevel = "Critical" | "High" | "Medium" | "Low";

export interface AffectedWorkItem {
  id: string;
  title: string;
  type: WorkItemType;
  priority: "High" | "Medium" | "Low";
  status: string;
  estimatedHours: number;
  remainingHours: number;
  dueDate: string | null;
  deadlineStatus: DeadlineStatus;
  overlapDays: number;
  risk: RiskLevel;
  riskExplanation: string;
  ticketId?: string;
  /** Planned hours that fall inside the leave window — what a cover actually takes on
   * (the owner's own per-day rate × the covered working days). Same distribution the
   * owner already had; nothing is compressed. */
  coverageHours: number;
  /** The working-day span inside the leave that needs covering, formatted. */
  turnoverStart: string | null;
  turnoverEnd: string | null;
  turnoverWorkingDays: number;
}

export interface CoverageCandidate {
  employee: Employee;
  /** Utilization % ON THE LEAVE DATES (scheduled hours ÷ available hours in the window). */
  utilization: number;
  /** Available % in the window. */
  availableCapacity: number;
  /** Utilization % in the window if they also took on the coverage hours. */
  projectedCapacity: number;
  /** Hours, for the detail rows. */
  windowCapacityHours: number;
  windowScheduledHours: number;
  windowAvailableHours: number;
  coverageHours: number;
  skillMatch: number;
  matchedSkills: string[];
  /** On approved leave for any part of the turnover window — the one hard block. */
  onLeave: boolean;
  /** Covering this would push them past the overload threshold IN THE WINDOW, or
   * they simply don't have the hours. */
  overloaded: boolean;
  /** Can be picked at all — everyone in the unit except those on leave during the
   * window. A missing skill match does NOT make someone un-assignable. */
  assignable: boolean;
  /** Suitable to recommend automatically. */
  eligible: boolean;
  excludeReason?: string;
  /** Short, human "why they're ranked here" clauses (deadline / capacity / skills). */
  reasons: string[];
}

export interface LeaveOverlap {
  employeeName: string;
  start: string;
  end: string;
  confirmed: boolean;
  overlapDays: number;
}

export interface AbsenceImpact {
  employee: Employee;
  start: Date;
  end: Date;
  /** Working days inside the leave window — the turnover period. */
  turnoverWorkingDays: number;
  affectedWork: AffectedWorkItem[];
  totalEstimatedHours: number;
  /** Total planned hours that need covering across all affected work. */
  totalCoverageHours: number;
  deadlinesAtRisk: number;
  candidatesByItem: Map<string, CoverageCandidate[]>;
  /** The frozen coverage plan per affected ticket, ready to store on accept. */
  coveragePlanByItem: Map<string, { allocations: { dateKey: string; hours: number }[]; hours: number }>;
  primaryCandidateId: string | null;
}

function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function calendarOverlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  return start > end ? 0 : daysBetween(start, end) + 1;
}

function mapDeadlineStatus(dueDate: string | null): DeadlineStatus {
  if (!dueDate) return "On Track";
  const status = getDueStatus(dueDate);
  if (status === "Overdue") return "Overdue";
  if (status === "Due Soon") return "Approaching";
  return "On Track";
}

function assessRisk(
  dueDate: string | null,
  absenceStart: Date,
  absenceEnd: Date,
  remainingHours: number,
  hoursPerDay: number
): { risk: RiskLevel; explanation: string } {
  const due = dueDate ? parseLooseDate(dueDate) : null;
  if (!due) {
    return { risk: "Low", explanation: "No scheduling impact." };
  }
  if (due.getTime() < todayStart().getTime()) {
    return { risk: "Critical", explanation: "Already overdue — no one is available to resolve it." };
  }
  if (due >= absenceStart && due <= absenceEnd) {
    return { risk: "Critical", explanation: "Deadline falls during the leave — will be missed unless someone covers it." };
  }
  const bufferDays = due > absenceEnd ? countWorkingDays(addDays(absenceEnd, 1), due) : 0;
  const bufferHours = bufferDays * hoursPerDay;
  if (bufferHours < remainingHours) {
    return { risk: "Critical", explanation: "Deadline will be missed unless the leave days are covered." };
  }
  if (bufferDays <= 3 && remainingHours >= 6) {
    return { risk: "High", explanation: "Tight after the leave — may not be completed before the deadline." };
  }
  if (bufferDays > 10 && remainingHours <= 2) {
    return { risk: "Low", explanation: "No scheduling impact." };
  }
  return {
    risk: "Medium",
    explanation: `Affected during the leave, but there's time after return (${bufferDays} working day${bufferDays === 1 ? "" : "s"}) to finish the rest.`,
  };
}

/**
 * Does this item actually have planned work/effort during `[absenceStart, absenceEnd]`?
 * (A deadline after the leave is not, on its own, enough.)
 */
export function plannedWorkOverlapsAbsence(
  remainingHours: number,
  startDate: Date,
  due: Date | null,
  employee: Employee,
  absenceStart: Date,
  absenceEnd: Date
): boolean {
  if (remainingHours <= 0) return false;
  const today = todayStart();
  const plannedStart = startDate > today ? startDate : today;
  if (plannedStart > absenceEnd) return false;
  if (due && due < absenceStart) return false;

  const hoursPerDay = (employee.weeklyHours || 40) / 5;
  const dayBeforeAbsence = addDays(absenceStart, -1);
  const workingDaysBefore = Math.max(
    0,
    countWorkingDays(plannedStart, dayBeforeAbsence) -
      leaveWorkingDaysBetween(employee, plannedStart, dayBeforeAbsence)
  );
  const capacityBefore = workingDaysBefore * hoursPerDay;

  if (capacityBefore >= remainingHours && (!due || due > absenceEnd)) return false;
  return true;
}

/** All active work assigned to `employee` whose planned effort overlaps the leave.
 * Reads planned effort straight off the employee's real schedule (`itemHoursInRange`)
 * so "what needs covering" always matches what Daily Tasks / Calendar / Workload View
 * show for those same days. */
export function computeAffectedWork(
  employee: Employee,
  tickets: AssignedTicket[],
  start: Date,
  end: Date,
  getEntry: WorkLogLookup,
  events: CalendarEvent[] = []
): AffectedWorkItem[] {
  const workingDaysAffected = countWorkingDays(start, end);
  const hoursPerDay = (employee.weeklyHours || 40) / 5;
  const ownerSchedule = computeEmployeeSchedule(employee, tickets, getEntry, events);
  const scheduledByKey = new Map(ownerSchedule.items.map((i) => [i.key, i] as const));
  const items: AffectedWorkItem[] = [];

  tickets
    .filter((t) => (t.assignedEmployeeIds ?? []).includes(employee.id) && t.status !== "Completed")
    .forEach((t) => {
      const key = `${employee.id}:${t.id}`;
      const entry = getEntry(key);
      const effort = ticketEffortForEmployee(t, employee.id);
      const override = typeof entry.remainingHours === "number" ? entry.remainingHours : null;
      const remaining = itemRemainingHours(effort, false, entry.progress, override);
      const due = resolveDueDate(t.expectedResolutionDate, t.priority, t.raisedDate);
      if (!plannedWorkOverlapsAbsence(remaining, itemStartDate(t.raisedDate), due, employee, start, end)) return;

      const scheduled = scheduledByKey.get(key);
      const plan = scheduled ? itemHoursInRange(scheduled, start, end) : { allocations: [], hours: 0 };
      const covKeys = plan.allocations.map((a) => a.dateKey);
      const dueLabel = ticketDueLabel(t);
      const { risk, explanation } = assessRisk(dueLabel, start, end, remaining, hoursPerDay);
      items.push({
        id: t.id,
        title: t.title,
        type: "Ticket",
        priority: t.priority,
        status: t.status,
        estimatedHours: effort,
        remainingHours: remaining,
        dueDate: dueLabel,
        deadlineStatus: mapDeadlineStatus(dueLabel),
        overlapDays: workingDaysAffected,
        risk,
        riskExplanation: explanation,
        ticketId: t.id,
        // Coverage Required = the planned effort that falls INSIDE the absence window,
        // read straight off the owner's real schedule (`itemHoursInRange`). Never the
        // whole remaining effort — the rest stays with the owner for after they return.
        // The `Math.min` is only a defensive fallback for the impossible case where an
        // active assigned ticket has no scheduled item at all.
        coverageHours: scheduled ? plan.hours : Math.round(Math.min(remaining, hoursPerDay * workingDaysAffected) * 10) / 10,
        turnoverStart: covKeys[0] ? formatDisplayDate(dateFromKey(covKeys[0])) : null,
        turnoverEnd: covKeys[covKeys.length - 1] ? formatDisplayDate(dateFromKey(covKeys[covKeys.length - 1])) : null,
        turnoverWorkingDays: covKeys.length || workingDaysAffected,
      });
    });

  employee.adhoc.forEach((a) => {
    const key = `${employee.id}:${a.id}`;
    const entry = getEntry(key);
    const override = typeof entry.remainingHours === "number" ? entry.remainingHours : null;
    const remaining = itemRemainingHours(a.estimatedHours, false, entry.progress, override);
    const dueDate = a.deadline === "Ongoing" ? null : adhocDueLabel(a);
    const overlaps =
      a.deadline === "Ongoing"
        ? remaining > 0
        : plannedWorkOverlapsAbsence(remaining, todayStart(), resolveDueDate(a.deadline, a.priority), employee, start, end);
    if (!overlaps) return;
    const { risk, explanation } = assessRisk(dueDate, start, end, remaining, hoursPerDay);
    const scheduled = scheduledByKey.get(key);
    const plan = scheduled ? itemHoursInRange(scheduled, start, end) : { allocations: [], hours: 0 };
    items.push({
      id: a.id,
      title: a.name,
      type: "Ad-hoc",
      priority: a.priority,
      status: a.status,
      estimatedHours: a.estimatedHours,
      remainingHours: remaining,
      dueDate,
      deadlineStatus: mapDeadlineStatus(dueDate),
      overlapDays: workingDaysAffected,
      risk,
      riskExplanation: explanation,
      // See the ticket branch: covered = planned effort inside the window only.
      coverageHours: scheduled ? plan.hours : Math.round(Math.min(remaining, hoursPerDay * workingDaysAffected) * 10) / 10,
      turnoverStart: formatDisplayDate(start),
      turnoverEnd: formatDisplayDate(end),
      turnoverWorkingDays: workingDaysAffected,
    });
  });

  return items;
}

const RISK_ORDER: Record<RiskLevel, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function requiredSkillNames(item: AffectedWorkItem, ticket: AssignedTicket | undefined, absentEmployee: Employee): string[] {
  if (ticket) return ticket.relatedSkills ?? [];
  return absentEmployee.skills.map((s: Skill) => s.name);
}

/** Working days inside `[start, end]` the candidate is NOT on leave — the real
 * turnover capacity denominator for that person. */
function windowWorkingDaysAvailable(employee: Employee, start: Date, end: Date): number {
  let n = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last) {
    const day = cursor.getDay();
    if (day !== 5 && day !== 6 && !isOnLeaveDate(employee, cursor)) n += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return n;
}

function coverageCandidatesForItem(
  item: AffectedWorkItem,
  ticket: AssignedTicket | undefined,
  absentEmployee: Employee,
  peers: Employee[],
  allTickets: AssignedTicket[],
  getEntry: WorkLogLookup,
  events: CalendarEvent[],
  start: Date,
  end: Date
): CoverageCandidate[] {
  const required = requiredSkillNames(item, ticket, absentEmployee);
  const coverageHours = item.coverageHours;

  return peers
    .map((e) => {
      const perDay = (e.weeklyHours || 40) / 5;

      // On approved leave for any part of the turnover window — the one hard block.
      const onLeave = e.leaveEvents.some((l) => {
        if (l.status === "Pending") return false;
        const ls = parseLooseDate(l.start);
        const le = parseLooseDate(l.end);
        return ls && le ? rangesOverlap(start, end, ls, le) : false;
      });

      // Capacity IN THE WINDOW: working days not on leave, minus timed calendar events.
      const availDays = windowWorkingDaysAvailable(e, start, end);
      const eventHours = calendarEventHoursBetween(events, e.id, start, end);
      const windowCapacityHours = Math.max(0, Math.round((availDays * perDay - eventHours) * 10) / 10);

      // Existing scheduled workload on those dates (their real deadline-driven schedule).
      const schedule = computeEmployeeSchedule(e, allTickets, getEntry, events);
      const windowScheduledHours = scheduledHoursBetween(schedule, start, end);
      const windowAvailableHours = Math.round((windowCapacityHours - windowScheduledHours) * 10) / 10;

      const denom = windowCapacityHours > 0 ? windowCapacityHours : e.weeklyHours || 40;
      const utilization = Math.round((windowScheduledHours / denom) * 100);
      const projectedCapacity = Math.round(((windowScheduledHours + coverageHours) / denom) * 100);

      const skillMatch = computeSkillMatch(e, required);
      const matchedSkills = e.skills
        .map((s) => s.name)
        .filter((name) => required.some((r) => r.toLowerCase() === name.toLowerCase()));

      const notEnoughHours = !onLeave && windowAvailableHours < coverageHours - 0.5;
      const overloaded = !onLeave && (projectedCapacity > OVERLOAD_THRESHOLD || notEnoughHours);
      const missingSkill = required.length > 0 && skillMatch === 0;

      const assignable = !onLeave;
      const eligible = assignable && !overloaded && !missingSkill;

      let excludeReason: string | undefined;
      if (onLeave) excludeReason = "On approved leave during the turnover window";
      else if (notEnoughHours) excludeReason = `Only ${Math.max(0, windowAvailableHours)}h free in the window — needs ${coverageHours}h`;
      else if (projectedCapacity > OVERLOAD_THRESHOLD) excludeReason = "Covering this would overload them during the window";
      else if (missingSkill) excludeReason = "No matching skill — assign manually if needed";

      const reasons: string[] = [];
      if (onLeave) reasons.push("On leave during the turnover — not available");
      else {
        reasons.push(`${windowAvailableHours}h free during ${formatDisplayDate(start)}–${formatDisplayDate(end)} (needs ${coverageHours}h)`);
        reasons.push(`Window capacity ${utilization}% → ${projectedCapacity}% with this cover`);
      }
      if (matchedSkills.length > 0) reasons.push(`Skill match: ${matchedSkills.join(", ")}`);
      else if (required.length > 0) reasons.push("No matching skill for this task");

      return {
        employee: e,
        utilization,
        availableCapacity: Math.max(0, 100 - utilization),
        projectedCapacity,
        windowCapacityHours,
        windowScheduledHours,
        windowAvailableHours,
        coverageHours,
        skillMatch,
        matchedSkills,
        onLeave,
        overloaded,
        assignable,
        eligible,
        excludeReason,
        reasons,
      };
    })
    .sort(
      (a, b) =>
        Number(b.assignable) - Number(a.assignable) ||
        Number(b.eligible) - Number(a.eligible) ||
        b.skillMatch - a.skillMatch ||
        b.windowAvailableHours - a.windowAvailableHours ||
        a.projectedCapacity - b.projectedCapacity
    );
}

/** Other employees in the unit already on approved leave, or with another pending
 * request, overlapping the given date range. */
export function findLeaveOverlaps(
  employeeId: string,
  start: Date,
  end: Date,
  unitEmployees: Employee[],
  pending: { id: string; employeeId: string; startDate: string; endDate: string }[]
): LeaveOverlap[] {
  const overlaps: LeaveOverlap[] = [];

  unitEmployees.forEach((e) => {
    if (e.id === employeeId) return;
    e.leaveEvents.forEach((l) => {
      if (l.status === "Pending") return;
      const lStart = parseLooseDate(l.start);
      const lEnd = parseLooseDate(l.end);
      if (!lStart || !lEnd || !rangesOverlap(start, end, lStart, lEnd)) return;
      overlaps.push({
        employeeName: e.name,
        start: l.start,
        end: l.end,
        confirmed: true,
        overlapDays: calendarOverlapDays(start, end, lStart, lEnd),
      });
    });
  });

  pending.forEach((other) => {
    if (other.employeeId === employeeId) return;
    const oStart = parseLooseDate(other.startDate);
    const oEnd = parseLooseDate(other.endDate);
    if (!oStart || !oEnd || !rangesOverlap(start, end, oStart, oEnd)) return;
    const otherEmployee = unitEmployees.find((e) => e.id === other.employeeId);
    overlaps.push({
      employeeName: otherEmployee?.name ?? other.employeeId,
      start: other.startDate,
      end: other.endDate,
      confirmed: false,
      overlapDays: calendarOverlapDays(start, end, oStart, oEnd),
    });
  });

  return overlaps;
}

export function computeAbsenceImpact(params: {
  employee: Employee;
  unitEmployees: Employee[];
  tickets: AssignedTicket[];
  startLabel: string;
  endLabel: string;
  getEntry: WorkLogLookup;
  events?: CalendarEvent[];
  /** Coverage the supervisor has PROPOSED but not yet applied, keyed by ticketId.
   * Used only to project a candidate's own capacity against the OTHER work they've
   * been proposed to cover in the same plan — it never touches the affected-work
   * analysis or the coverage requirement, which are read from the OWNER's baseline
   * schedule with any coverage on the owner's own tickets stripped out. */
  stagedCoverage?: Record<string, TicketCoverage>;
}): AbsenceImpact | null {
  const { employee, unitEmployees, tickets, startLabel, endLabel, getEntry, events = [], stagedCoverage = {} } = params;
  const start = parseLooseDate(startLabel);
  const end = parseLooseDate(endLabel);
  if (!start || !end || start > end) return null;

  const peers = unitEmployees.filter((e) => e.id !== employee.id);

  // "Affected work" and "planned effort during absence" describe the OWNER'S baseline
  // schedule. Strip any coverage on the owner's own tickets first — staged OR already
  // applied — so proposing (or reopening) a coverage plan can never inflate the
  // covered slice back up to the task's whole remaining effort. The remaining effort
  // outside the window always stays scheduled on the owner.
  const ownerBaselineTickets = tickets.map((t) =>
    t.coverage && t.coverage.ownerId === employee.id ? { ...t, coverage: null } : t
  );
  const affectedWork = computeAffectedWork(employee, ownerBaselineTickets, start, end, getEntry, events);
  const ownerSchedule = computeEmployeeSchedule(employee, ownerBaselineTickets, getEntry, events);
  const scheduledByKey = new Map(ownerSchedule.items.map((i) => [i.key, i] as const));

  const candidatesByItem = new Map<string, CoverageCandidate[]>();
  const coveragePlanByItem = new Map<string, { allocations: { dateKey: string; hours: number }[]; hours: number }>();
  affectedWork.forEach((item) => {
    const ticket = item.ticketId ? tickets.find((t) => t.id === item.ticketId) : undefined;
    // For THIS item's candidate ranking, project each peer against every OTHER
    // staged/applied coverage but NOT this item's own — otherwise proposing someone
    // here would double-count this task's hours against its own candidate list.
    const candidateTickets = tickets.map((t) => {
      if (t.id === item.ticketId) {
        return t.coverage && t.coverage.ownerId === employee.id ? { ...t, coverage: null } : t;
      }
      const staged = stagedCoverage[t.id];
      return staged ? { ...t, coverage: staged } : t;
    });
    candidatesByItem.set(
      item.id,
      coverageCandidatesForItem(item, ticket, employee, peers, candidateTickets, getEntry, events, start, end)
    );
    const scheduled = scheduledByKey.get(`${employee.id}:${item.id}`);
    if (ticket && scheduled) coveragePlanByItem.set(item.id, itemHoursInRange(scheduled, start, end));
  });

  const urgentItems = affectedWork.filter((i) => i.risk === "Critical" || i.risk === "High");
  const topPickCounts = new Map<string, number>();
  urgentItems.forEach((item) => {
    const list = candidatesByItem.get(item.id);
    const top = list?.find((c) => c.eligible) ?? list?.find((c) => c.assignable);
    if (top) topPickCounts.set(top.employee.id, (topPickCounts.get(top.employee.id) ?? 0) + 1);
  });
  let primaryCandidateId: string | null = null;
  let bestCount = 0;
  topPickCounts.forEach((count, id) => {
    if (count > bestCount) {
      bestCount = count;
      primaryCandidateId = id;
    }
  });
  if (!primaryCandidateId && affectedWork[0]) {
    const list = candidatesByItem.get(affectedWork[0].id);
    primaryCandidateId = (list?.find((c) => c.eligible) ?? list?.find((c) => c.assignable))?.employee.id ?? null;
  }

  return {
    employee,
    start,
    end,
    turnoverWorkingDays: countWorkingDays(start, end),
    affectedWork: [...affectedWork].sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]),
    totalEstimatedHours: Math.round(affectedWork.reduce((sum, w) => sum + w.remainingHours, 0) * 10) / 10,
    totalCoverageHours: Math.round(affectedWork.reduce((sum, w) => sum + w.coverageHours, 0) * 10) / 10,
    deadlinesAtRisk: affectedWork.filter((w) => w.dueDate && (w.risk === "Critical" || w.risk === "High")).length,
    candidatesByItem,
    coveragePlanByItem,
    primaryCandidateId,
  };
}
