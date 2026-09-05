import type { Employee, SkillLevel } from "@/data/types";
import type { Ticket } from "@/data/tickets";
import type { AssignedTicket } from "@/store/tickets-store";
import type { CalendarEvent } from "@/store/calendar-events-store";
import { availableCapacity } from "@/lib/capacity";
import {
  isCurrentlyOnLeave,
  isOnUpcomingLeave,
  currentLeaveEvent,
  projectedWeeklyTrajectoryForTicket,
  type WorkLogLookup,
  type WeeklyCapacityPoint,
} from "@/lib/capacityEngine";
import { resolveDueDate, daysBetween, todayStart, parseLooseDate, formatDisplayDate } from "@/lib/date";
import { computeSkillMatch } from "@/lib/simulate";
import { OVERLOAD_THRESHOLD } from "@/data/config";

/** Skill-match at or above this counts as a "primary recommended" candidate — the
 * assignment picker shows these first and hides the rest behind "Show all employees". */
export const PRIMARY_SKILL_MATCH = 50;

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
  /** Utilization THIS WEEK if assigned — kept for the simple "current → after" display. */
  projectedCapacity: number;
  /** The full weekly trajectory (before/after) from now through the ticket's own
   * deadline, from the same engine that will actually schedule the work — so a
   * candidate busy this week but with room before the deadline isn't penalized for
   * today's number alone. */
  weeklyTrajectory: (WeeklyCapacityPoint & { before: number })[];
  /** The worst (highest) utilization the candidate would reach in any week up to the
   * ticket's deadline if they took it on — the ranking's real "is this safe" signal. */
  peakProjected: number;
  /** On approved leave TODAY. Not a reason to hide them — see `leaveNote`. */
  onLeaveNow: boolean;
  /** Whether their leave covers so much of the today→deadline window that they
   * realistically can't do this work in time. */
  unavailableForDeadline: boolean;
  /** Human note about their leave/availability across the relevant period, or null. */
  leaveNote: string | null;
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

/**
 * Ranks a unit's employees for a ticket by skill match, then by their FORWARD fit —
 * the worst utilization they'd reach in any week between now and the ticket's own
 * deadline if they took it on, evaluated by cloning the ticket onto their real
 * schedule and running it through the same engine used everywhere else. An employee
 * at capacity today, OR on leave today, is NOT excluded: what matters is whether they
 * can do the work in the window before the deadline. Their leave/availability across
 * that window is surfaced so the supervisor can judge for themselves.
 */
export function rankCandidatesForTicket(
  employees: Employee[],
  ticket: Ticket,
  allTickets: AssignedTicket[],
  getEntry: WorkLogLookup,
  events: CalendarEvent[] = [],
  limit = 3
): TicketCandidate[] {
  const requiredSkills =
    ticket.relatedSkills && ticket.relatedSkills.length > 0
      ? ticket.relatedSkills
      : extractRequiredSkillsFromText(ticket, employees);

  const dueDate = resolveDueDate(ticket.expectedResolutionDate, ticket.priority, ticket.raisedDate);
  // Enough weeks to comfortably span the ticket's own deadline, capped for sanity.
  const weeksSpan = Math.max(2, Math.min(10, Math.ceil(daysBetween(todayStart(), dueDate) / 7) + 1));

  return employees
    .map((employee) => {
      const skillMatch = computeSkillMatch(employee, requiredSkills);
      const matchedSkillLevels = employee.skills.filter((s) =>
        requiredSkills.some((r) => r.toLowerCase() === s.name.toLowerCase())
      );
      const matchedSkills = matchedSkillLevels.map((s) => s.name);
      const avail = availableCapacity(employee.currentUtilization);

      const { before, after } = projectedWeeklyTrajectoryForTicket(
        employee,
        allTickets,
        getEntry,
        ticket as AssignedTicket,
        events,
        weeksSpan
      );
      const weeklyTrajectory = after.map((w, i) => ({ ...w, before: before[i]?.utilization ?? w.utilization }));
      // Only weeks up to (and including) the one the deadline falls in count toward
      // "is this safe" — weeks after the deadline are irrelevant to this ticket.
      const relevant = weeklyTrajectory.filter((w) => w.weekStart <= dueDate);
      const peakProjected = relevant.length ? Math.max(...relevant.map((w) => w.utilization)) : after[0]?.utilization ?? employee.currentUtilization;
      const projected = after[0]?.utilization ?? employee.currentUtilization;

      const onLeaveNow = isCurrentlyOnLeave(employee);
      const onLeaveSoon = !onLeaveNow && isOnUpcomingLeave(employee);
      const perWeek = employee.weeklyHours || 40;
      // Weeks in the relevant window where leave wipes out most of the working time.
      const leaveWeeks = relevant.filter((w) => w.workingHours < perWeek * 0.4).length;
      const unavailableForDeadline = relevant.length > 0 && leaveWeeks === relevant.length;
      const availabilityPenalty = unavailableForDeadline ? 3 : leaveWeeks > 0 ? 1 : onLeaveSoon ? 1 : 0;

      let leaveNote: string | null = null;
      const cur = currentLeaveEvent(employee);
      if (cur) {
        const end = parseLooseDate(cur.end);
        const back = end ? formatDisplayDate(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)) : cur.end;
        leaveNote = unavailableForDeadline
          ? `On leave (${cur.start} – ${cur.end}) for the whole window before the deadline`
          : `On leave until ${cur.end} — back ${back}, in time for this work`;
      } else if (onLeaveSoon) {
        const soon = employee.leaveEvents.find((l) => l.status !== "Pending" && parseLooseDate(l.start));
        if (soon) leaveNote = `Leave coming up: ${soon.start} – ${soon.end}`;
      }

      const reasons: string[] = [];
      reasons.push(
        matchedSkillLevels.length > 0
          ? `Skill match on ${matchedSkillLevels.map((s) => `${s.name} (${s.level})`).join(", ")}`
          : "No specific skill match — ranked by capacity"
      );
      if (leaveNote) reasons.push(leaveNote);
      const thisWeek = weeklyTrajectory[0];
      if (thisWeek && thisWeek.before !== thisWeek.utilization) {
        reasons.push(`This week ${thisWeek.before}% → ${thisWeek.utilization}%`);
      }
      const busyNowFreeLater =
        !onLeaveNow &&
        (employee.currentUtilization >= OVERLOAD_THRESHOLD || (thisWeek?.before ?? 0) >= OVERLOAD_THRESHOLD) &&
        peakProjected < OVERLOAD_THRESHOLD;
      if (busyNowFreeLater) {
        reasons.push(`Busy right now, but has room before the ${dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} deadline`);
      } else if (!unavailableForDeadline) {
        reasons.push(`Peak capacity ${peakProjected}% before the deadline`);
      }
      if (peakProjected > OVERLOAD_THRESHOLD && !unavailableForDeadline) {
        reasons.push(`Would exceed the ${OVERLOAD_THRESHOLD}% overload threshold before the deadline`);
      }

      return {
        employee,
        skillMatch,
        matchedSkills,
        matchedSkillLevels,
        currentUtilization: employee.currentUtilization,
        availableCapacity: avail,
        projectedCapacity: projected,
        weeklyTrajectory,
        peakProjected,
        onLeaveNow,
        unavailableForDeadline,
        leaveNote,
        reasons,
        _availabilityPenalty: availabilityPenalty,
      };
    })
    // Genuinely unavailable for the whole window sinks to the bottom; otherwise rank by
    // skill match, then forward fit (lowest peak utilization before the deadline wins),
    // then today's available capacity as a final tiebreak. Nobody is removed.
    .sort(
      (a, b) =>
        a._availabilityPenalty - b._availabilityPenalty ||
        b.skillMatch - a.skillMatch ||
        a.peakProjected - b.peakProjected ||
        b.availableCapacity - a.availableCapacity
    )
    .map(({ _availabilityPenalty, ...c }) => {
      void _availabilityPenalty;
      return c;
    })
    .slice(0, limit);
}
