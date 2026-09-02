import type { Employee, SkillLevel } from "@/data/types";
import type { Ticket } from "@/data/tickets";
import { availableCapacity } from "@/lib/capacity";
import { computeSkillMatch } from "@/lib/simulate";
import {
  isCurrentlyOnLeave,
  isOnUpcomingLeave,
  weeklyWorkingHours,
  weeklyRequiredHoursForItem,
  itemStartDate,
} from "@/lib/capacityEngine";
import { resolveDueDate } from "@/lib/date";
import { OVERLOAD_THRESHOLD } from "@/data/config";

export interface TicketCandidate {
  employee: Employee;
  skillMatch: number;
  matchedSkills: string[];
  /** The employee's proficiency in each required skill they hold — shown in the
   * suggested-candidates list ("Networking: Advanced"). */
  matchedSkillLevels: { name: string; level: SkillLevel }[];
  /** The employee's current utilization %, for the "72% capacity" line. */
  currentUtilization: number;
  availableCapacity: number;
  projectedCapacity: number;
  reasons: string[];
}

/** Skills mentioned by name in the ticket's title/description — a fallback for tickets
 * without an explicit `relatedSkills` tag (e.g. ones raised through IT-Demand's own
 * "New Ticket" form). */
function extractRequiredSkillsFromText(ticket: Pick<Ticket, "title" | "description">, employees: Employee[]): string[] {
  const text = `${ticket.title} ${ticket.description}`.toLowerCase();
  const allSkills = new Set<string>();
  employees.forEach((e) => e.skills.forEach((s) => allSkills.add(s.name)));
  return Array.from(allSkills).filter((skill) => text.includes(skill.toLowerCase()));
}

/** Ranks a unit's employees for a ticket by skill match, then by available capacity —
 * used for the Work queue's "Suggested" employee. Employees currently on leave are
 * excluded entirely: they have 0 available capacity and can't pick up new work. */
export function rankCandidatesForTicket(employees: Employee[], ticket: Ticket, limit = 3): TicketCandidate[] {
  const requiredSkills =
    ticket.relatedSkills && ticket.relatedSkills.length > 0
      ? ticket.relatedSkills
      : extractRequiredSkillsFromText(ticket, employees);

  return employees
    .filter((employee) => !isCurrentlyOnLeave(employee))
    .map((employee) => {
      const skillMatch = computeSkillMatch(employee, requiredSkills);
      const matchedSkillLevels = employee.skills.filter((s) =>
        requiredSkills.some((r) => r.toLowerCase() === s.name.toLowerCase())
      );
      const matchedSkills = matchedSkillLevels.map((s) => s.name);
      const avail = availableCapacity(employee.currentUtilization);
      // Deadline-driven weekly load of this ticket for this person, added to their
      // current (already deadline-aware) capacity — the same maths as everywhere else.
      const due = resolveDueDate(ticket.expectedResolutionDate, ticket.priority, ticket.raisedDate);
      const extraWeekly = weeklyRequiredHoursForItem(ticket.estimatedHours, itemStartDate(ticket.raisedDate), due, employee);
      const denom = weeklyWorkingHours(employee) || employee.weeklyHours || 40;
      const projected = Math.round(employee.currentUtilization + (extraWeekly / denom) * 100);

      const onLeaveNow = isCurrentlyOnLeave(employee);
      const onLeaveSoon = !onLeaveNow && isOnUpcomingLeave(employee);

      const reasons: string[] = [];
      reasons.push(
        matchedSkillLevels.length > 0
          ? `Skill match on ${matchedSkillLevels.map((s) => `${s.name} (${s.level})`).join(", ")}`
          : "No specific skill match — ranked by capacity"
      );
      reasons.push(`Current capacity ${employee.currentUtilization}% → ${projected}% after assignment`);
      if (projected > OVERLOAD_THRESHOLD) reasons.push(`Assigning would exceed the ${OVERLOAD_THRESHOLD}% overload threshold`);
      if (onLeaveNow) reasons.push("On leave right now");
      else if (onLeaveSoon) reasons.push("Starting leave within a week");

      return {
        employee,
        skillMatch,
        matchedSkills,
        matchedSkillLevels,
        currentUtilization: employee.currentUtilization,
        availableCapacity: avail,
        projectedCapacity: projected,
        reasons,
        _leavePenalty: onLeaveNow ? 2 : onLeaveSoon ? 1 : 0,
      };
    })
    // Push people who are (about to be) on leave down the list, then rank by skill
    // match and available capacity.
    .sort(
      (a, b) =>
        a._leavePenalty - b._leavePenalty ||
        b.skillMatch - a.skillMatch ||
        b.availableCapacity - a.availableCapacity
    )
    .map(({ _leavePenalty, ...c }) => {
      void _leavePenalty;
      return c;
    })
    .slice(0, limit);
}
