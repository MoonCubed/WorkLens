// What should an employee work on first? A single ranking used by Plan My Day, the
// Daily Tasks "work on first" hint and any "recommended because…" explanation — built
// entirely from information WorkLens already has (deadline proximity, priority,
// remaining effort, current workload, available time). It never changes a task; it
// only orders and explains.

import type { ScheduledWorkItem } from "@/lib/capacityEngine";
import { daysBetween, todayStart } from "@/lib/date";

export interface PrioritisedItem {
  item: ScheduledWorkItem;
  /** Higher = do sooner. */
  score: number;
  /** Short, human "why it's ranked here" — e.g. "Overdue · High priority · 4h left". */
  reason: string;
  /** Whole days until the deadline (negative = overdue). */
  daysToDeadline: number;
}

const PRIORITY_WEIGHT: Record<ScheduledWorkItem["priority"], number> = { High: 30, Medium: 15, Low: 5 };

/** Days from today to `date` (0 = today, 1 = tomorrow, negative = past). */
function daysUntil(date: Date): number {
  return daysBetween(todayStart(), new Date(date.getFullYear(), date.getMonth(), date.getDate()));
}

function deadlinePhrase(days: number): string {
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

/**
 * Rank one employee's schedule items (already filtered to what's workable — pass
 * `schedule.activeItems`). `availableToday` lets the ranking notice when a single
 * task's remaining effort already outstrips the time there is to do it.
 */
export function prioritiseWork(items: ScheduledWorkItem[], availableToday = 0): PrioritisedItem[] {
  return items
    .filter((i) => i.remainingHours > 0)
    .map((item) => {
      const d = daysUntil(item.deadline);
      let score = 0;
      const clauses: string[] = [];

      if (item.overdue) {
        score += 1000;
        clauses.push(deadlinePhrase(d));
      } else if (item.deadlineUnreachable) {
        score += 850;
        clauses.push("deadline at risk");
      } else {
        // Nearer deadlines rank higher; flat past ~30 days out.
        score += Math.max(0, 30 - Math.min(30, Math.max(0, d))) * 6;
        clauses.push(deadlinePhrase(d));
      }

      score += PRIORITY_WEIGHT[item.priority];
      if (item.priority !== "Medium") clauses.push(`${item.priority} priority`);

      // Effort vs. the time there is to do it before the deadline.
      const workingDaysLeft = Math.max(1, item.workingDayKeys.length);
      const pressure = item.remainingHours / workingDaysLeft;
      if (pressure >= (availableToday || 6)) score += 40;
      clauses.push(`${item.remainingHours}h remaining`);

      // A dependency that isn't done yet pushes the task down — it can't sensibly be
      // started first — but it's still surfaced so the reason is clear.
      if (item.blockedByDependency) {
        score -= 500;
        clauses.push(`waiting on ${item.dependencyTitle ?? "a prerequisite"}`);
      }

      return { item, score, daysToDeadline: d, reason: clauses.slice(0, 3).join(" · ") };
    })
    .sort((a, b) => b.score - a.score);
}

/** "Recommended because: 4h available today, deadline tomorrow, and 6h remaining." */
export function recommendationReason(p: PrioritisedItem, availableToday: number): string {
  const parts: string[] = [];
  if (availableToday > 0) parts.push(`${Math.round(availableToday * 10) / 10}h available today`);
  parts.push(deadlinePhrase(p.daysToDeadline));
  parts.push(`${p.item.remainingHours}h remaining`);
  if (p.item.priority === "High") parts.push("High priority");
  const last = parts.pop();
  return `Recommended because: ${parts.join(", ")}${parts.length ? ", and " : ""}${last}.`;
}
