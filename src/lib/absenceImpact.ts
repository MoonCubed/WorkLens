// Calculation engine behind the Handover & Continuity Planner. Pure functions only (no
// React) so the page and its sub-components can stay focused on rendering.
//
// The app's data model has no "Project"/Flow/SDLC system at all — tickets are the one
// system-of-record work type. `adhoc` on Employee is the seed-driven ad-hoc workload
// picture already shown elsewhere (supervisor's employee-detail page, MyWorkList), so
// it's folded in too. `upcomingTickets` (a seed duplicate of the ticket concept) is
// skipped to avoid double-counting a unit's real tickets under two different systems.

import type { Employee, Skill } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import {
  todayStart,
  parseLooseDate,
  getDueStatus,
  resolveDueDate,
  addDays,
  daysBetween,
  countWorkingDays,
} from "@/lib/date";
import { ticketDueLabel, adhocDueLabel } from "@/lib/due";
import {
  ticketEffortForEmployee,
  itemStartDate,
  leaveWorkingDaysBetween,
  weeklyRequiredHoursForItem,
} from "@/lib/capacityEngine";
import { computeSkillMatch } from "@/lib/simulate";
import { availableCapacity } from "@/lib/capacity";
import { rankCandidatesForTicket } from "@/lib/ticketMatch";
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
}

export interface CoverageCandidate {
  employee: Employee;
  /** Current capacity % (synced utilization) — the "Current Capacity" figure. */
  utilization: number;
  availableCapacity: number;
  /** Capacity % if this person covered the item — the "After Assignment" figure. */
  projectedCapacity: number;
  skillMatch: number;
  matchedSkills: string[];
  workloadDuringAbsence: number;
  onLeave: boolean;
  /** Covering this item would push them past the overload threshold. Surfaced as a
   * risk, never a block — the supervisor can still assign. */
  overloaded: boolean;
  /** Can be picked at all — everyone in the unit except those on leave during the
   * absence. A missing skill match does NOT make someone un-assignable; it only
   * lowers their ranking. */
  assignable: boolean;
  /** Suitable to recommend automatically — assignable, not overloaded, has some
   * skill overlap (or the item needs no particular skill). */
  eligible: boolean;
  excludeReason?: string;
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
  affectedWork: AffectedWorkItem[];
  totalEstimatedHours: number;
  deadlinesAtRisk: number;
  candidatesByItem: Map<string, CoverageCandidate[]>;
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
    return { risk: "Critical", explanation: "Deadline falls during the absence — will be missed unless reassigned." };
  }
  const bufferDays = due > absenceEnd ? countWorkingDays(addDays(absenceEnd, 1), due) : 0;
  const bufferHours = bufferDays * hoursPerDay;
  if (bufferHours < remainingHours) {
    return { risk: "Critical", explanation: "Deadline will be missed unless reassigned." };
  }
  if (bufferDays <= 3 && remainingHours >= 6) {
    return { risk: "High", explanation: "May not be completed before the deadline." };
  }
  if (bufferDays > 10 && remainingHours <= 2) {
    return { risk: "Low", explanation: "No scheduling impact." };
  }
  return {
    risk: "Medium",
    explanation: `Affected during the absence, but there's time after return (${bufferDays} working day${bufferDays === 1 ? "" : "s"}) to finish the remaining work.`,
  };
}

/**
 * Does this item actually have planned work/effort during `[absenceStart, absenceEnd]`?
 *
 * A deadline after the leave is *not* enough — what matters is whether, on the item's
 * deadline-driven schedule, effort is still outstanding once the leave begins:
 *
 *  - Deadline before the leave starts        → work wraps up before the leave  → no.
 *  - Work only starts after the person is back → nothing to hand over           → no.
 *  - Enough working time before the leave to finish it, and the deadline doesn't
 *    fall on/inside the leave                  → it can be cleared beforehand    → no.
 *  - Otherwise (incl. deadline during the leave) → planned effort overlaps       → yes.
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

  // Comfortably finishable before the leave and the deadline isn't forcing it into
  // the leave window → no handover needed.
  if (capacityBefore >= remainingHours && (!due || due > absenceEnd)) return false;
  return true;
}

/** All active work assigned to `employee` — live tickets plus their seed
 * project/ad-hoc workload — whose planned effort actually overlaps the absence window
 * (a deadline after the leave is not, on its own, enough — see `plannedWorkOverlapsAbsence`). */
export function computeAffectedWork(
  employee: Employee,
  tickets: AssignedTicket[],
  start: Date,
  end: Date
): AffectedWorkItem[] {
  const workingDaysAffected = countWorkingDays(start, end);
  const hoursPerDay = employee.weeklyHours / 5;

  const items: AffectedWorkItem[] = [];

  tickets
    .filter((t) => (t.assignedEmployeeIds ?? []).includes(employee.id) && t.status !== "Completed")
    .filter((t) => {
      const effort = ticketEffortForEmployee(t, employee.id);
      const due = resolveDueDate(t.expectedResolutionDate, t.priority, t.raisedDate);
      return plannedWorkOverlapsAbsence(effort, itemStartDate(t.raisedDate), due, employee, start, end);
    })
    .forEach((t) => {
      const dueLabel = ticketDueLabel(t);
      const effort = ticketEffortForEmployee(t, employee.id);
      const { risk, explanation } = assessRisk(dueLabel, start, end, effort, hoursPerDay);
      items.push({
        id: t.id,
        title: t.title,
        type: "Ticket",
        priority: t.priority,
        status: t.status,
        estimatedHours: effort,
        remainingHours: effort,
        dueDate: dueLabel,
        deadlineStatus: mapDeadlineStatus(dueLabel),
        overlapDays: workingDaysAffected,
        risk,
        riskExplanation: explanation,
        ticketId: t.id,
      });
    });

  employee.adhoc.forEach((a) => {
    const dueDate = a.deadline === "Ongoing" ? null : adhocDueLabel(a);
    // "Ongoing" ad-hoc work is continuous — it always needs cover during an absence.
    // Dated ad-hoc work follows the same planned-overlap test as tickets.
    const overlaps =
      a.deadline === "Ongoing"
        ? a.estimatedHours > 0
        : plannedWorkOverlapsAbsence(
            a.estimatedHours,
            todayStart(),
            resolveDueDate(a.deadline, a.priority),
            employee,
            start,
            end
          );
    if (!overlaps) return;
    const { risk, explanation } = assessRisk(dueDate, start, end, a.estimatedHours, hoursPerDay);
    items.push({
      id: a.id,
      title: a.name,
      type: "Ad-hoc",
      priority: a.priority,
      status: a.status,
      estimatedHours: a.estimatedHours,
      remainingHours: a.estimatedHours,
      dueDate,
      deadlineStatus: mapDeadlineStatus(dueDate),
      overlapDays: workingDaysAffected,
      risk,
      riskExplanation: explanation,
    });
  });

  return items;
}

const RISK_ORDER: Record<RiskLevel, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function requiredSkillNames(item: AffectedWorkItem, ticket: AssignedTicket | undefined, absentEmployee: Employee): string[] {
  if (ticket) return ticket.relatedSkills ?? [];
  return absentEmployee.skills.map((s: Skill) => s.name);
}

function coverageCandidatesForItem(
  item: AffectedWorkItem,
  ticket: AssignedTicket | undefined,
  absentEmployee: Employee,
  peers: Employee[],
  allTickets: AssignedTicket[],
  start: Date,
  end: Date
): CoverageCandidate[] {
  const required = requiredSkillNames(item, ticket, absentEmployee);

  const base = ticket
    ? rankCandidatesForTicket(peers, ticket, peers.length).map((c) => ({
        employee: c.employee,
        skillMatch: c.skillMatch,
        matchedSkills: c.matchedSkills,
        availableCapacity: c.availableCapacity,
        projectedCapacity: c.projectedCapacity,
      }))
    : peers
        .map((e) => {
          const skillMatch = computeSkillMatch(e, required);
          const matchedSkills = e.skills
            .map((s) => s.name)
            .filter((name) => required.some((r) => r.toLowerCase() === name.toLowerCase()));
          const avail = availableCapacity(e.currentUtilization);
          const due = item.dueDate ? parseLooseDate(item.dueDate) : null;
          const extra = due
            ? weeklyRequiredHoursForItem(item.remainingHours, todayStart(), due, e)
            : item.remainingHours;
          const denom = e.weeklyHours || 40;
          const projected = Math.round(e.currentUtilization + (extra / denom) * 100);
          return { employee: e, skillMatch, matchedSkills, availableCapacity: avail, projectedCapacity: projected };
        })
        .sort((a, b) => b.skillMatch - a.skillMatch || b.availableCapacity - a.availableCapacity);

  return base
    .map((c) => {
      const onLeave = c.employee.leaveEvents.some((l) => {
        if (l.status === "Pending") return false;
        const lStart = parseLooseDate(l.start);
        const lEnd = parseLooseDate(l.end);
        return lStart && lEnd ? rangesOverlap(start, end, lStart, lEnd) : false;
      });
      const workloadDuringAbsence = computeAffectedWork(c.employee, allTickets, start, end).reduce(
        (sum, w) => sum + w.remainingHours,
        0
      );
      const overloaded = c.projectedCapacity > OVERLOAD_THRESHOLD;
      const missingSkill = required.length > 0 && c.skillMatch === 0;
      // On leave during the absence is the only hard restriction — everyone else can
      // be assigned; skill / capacity concerns only affect ranking and warnings.
      const assignable = !onLeave;
      const eligible = assignable && !overloaded && !missingSkill;
      let excludeReason: string | undefined;
      if (onLeave) excludeReason = "On leave during this period";
      else if (overloaded) excludeReason = "Covering this would exceed the overload threshold";
      else if (missingSkill) excludeReason = "No matching skill — assign manually if needed";

      return {
        employee: c.employee,
        utilization: c.employee.currentUtilization,
        // On leave during the window → no availability to offer.
        availableCapacity: onLeave ? 0 : c.availableCapacity,
        projectedCapacity: c.projectedCapacity,
        skillMatch: c.skillMatch,
        matchedSkills: c.matchedSkills,
        workloadDuringAbsence,
        onLeave,
        overloaded,
        assignable,
        eligible,
        excludeReason,
      };
    })
    .sort(
      (a, b) =>
        Number(b.assignable) - Number(a.assignable) ||
        Number(b.eligible) - Number(a.eligible) ||
        b.skillMatch - a.skillMatch ||
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
}): AbsenceImpact | null {
  const { employee, unitEmployees, tickets, startLabel, endLabel } = params;
  const start = parseLooseDate(startLabel);
  const end = parseLooseDate(endLabel);
  if (!start || !end || start > end) return null;

  const peers = unitEmployees.filter((e) => e.id !== employee.id);
  const affectedWork = computeAffectedWork(employee, tickets, start, end);

  const candidatesByItem = new Map<string, CoverageCandidate[]>();
  affectedWork.forEach((item) => {
    const ticket = item.ticketId ? tickets.find((t) => t.id === item.ticketId) : undefined;
    candidatesByItem.set(item.id, coverageCandidatesForItem(item, ticket, employee, peers, tickets, start, end));
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
    affectedWork: [...affectedWork].sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]),
    totalEstimatedHours: affectedWork.reduce((sum, w) => sum + w.remainingHours, 0),
    deadlinesAtRisk: affectedWork.filter((w) => w.dueDate && (w.risk === "Critical" || w.risk === "High")).length,
    candidatesByItem,
    primaryCandidateId,
  };
}
