// Dev-only: reads the live demo dataset (dumped to scratchpad/live.json) and runs the
// REAL engine to check the coordinated scenario — capacity spread, future workload,
// Hinad's absence impact + coverage ranking, and the dashboard attention items.
// Run: node --import ./scripts/paths-hook.mjs scripts/demo-verify.ts <path-to-live.json>
import { readFileSync } from "node:fs";
import type { Employee } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import type { WorkLogEntry } from "@/store/work-log-store";
import { computeEmployeeCapacity, computeEmployeeWeeklyCapacity } from "@/lib/capacityEngine";
import { computeAbsenceImpact } from "@/lib/absenceImpact";
import { rankCandidatesForTicket } from "@/lib/ticketMatch";
import { todayStart, startOfWeek, addDays, parseLooseDate, getDueStatus } from "@/lib/date";
import { ticketDueLabel } from "@/lib/due";

// Reads a JSON snapshot of the live demo tables: { employees, tickets, workLog,
// handover, skillReqs, calEvents }. Produce one with a throwaway `pg` script that
// selects * from each table (the demo data lives in Supabase, not in this repo).
const path = process.argv[2];
if (!path) {
  console.error("usage: node --import ./scripts/paths-hook.mjs scripts/demo-verify.ts <live.json>");
  process.exit(1);
}
const raw = JSON.parse(readFileSync(path, "utf8"));

const employees: Employee[] = raw.employees.map((e: Record<string, unknown>) => ({
  ...e,
  weeklyHours: Number(e.weeklyHours) || 40,
  currentUtilization: Number(e.currentUtilization) || 0,
  skills: e.skills ?? [],
  knowledgeAreas: e.knowledgeAreas ?? [],
  upcomingTickets: e.upcomingTickets ?? [],
  adhoc: e.adhoc ?? [],
  leaveEvents: e.leaveEvents ?? [],
})) as Employee[];

const tickets: AssignedTicket[] = raw.tickets.map((t: Record<string, unknown>) => ({
  ...t,
  estimatedHours: Number(t.estimatedHours) || 0,
  slaHours: Number(t.slaHours) || 0,
  assignedEmployeeIds: t.assignedEmployeeIds ?? [],
  relatedSkills: t.relatedSkills ?? undefined,
})) as AssignedTicket[];

const wlMap = new Map<string, WorkLogEntry>();
for (const r of raw.workLog as Record<string, unknown>[]) {
  wlMap.set(`${r.employeeId}:${r.itemId}`, {
    workflowStatus: (r.workflowStatus as WorkLogEntry["workflowStatus"]) ?? undefined,
    progress: r.progress == null ? undefined : Number(r.progress),
    completedAt: (r.completedAt as string) ?? null,
    holdStartDate: (r.holdStartDate as string) ?? null,
    holdEndDate: (r.holdEndDate as string) ?? null,
    actualHours: r.actualHours == null ? null : Number(r.actualHours),
    remainingHours: r.remainingHours == null ? null : Number(r.remainingHours),
    progressUpdatedAt: (r.progressUpdatedAt as string) ?? null,
    comments: (r.comments as WorkLogEntry["comments"]) ?? [],
  });
}
const getEntry = (key: string): WorkLogEntry => wlMap.get(key) ?? { comments: [] };
const events = (raw.calEvents as Record<string, unknown>[]).map((e) => ({ ...e })) as never[];

const team = employees.filter((e) => e.level !== "Supervisor");
const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? id;

console.log(`\nToday: ${todayStart().toDateString()}   (week starts ${startOfWeek(todayStart()).toDateString()})`);

console.log("\n================ TEAM CAPACITY (this week) ================");
const capRows = team
  .map((e) => ({ e, c: computeEmployeeCapacity(e, tickets, getEntry, events) }))
  .sort((a, b) => b.c.utilization - a.c.utilization);
for (const { e, c } of capRows) {
  console.log(
    `  ${e.name.padEnd(20)} util ${String(c.utilization).padStart(3)}%   active ${String(c.activeHours).padStart(5)}h / ${c.workingHours}h   free ${String(c.availableHours).padStart(5)}h   remaining ${c.totalRemainingHours}h${c.onLeave ? "  [ON LEAVE NOW]" : ""}`
  );
}

console.log("\n================ FUTURE WEEKLY WORKLOAD (util % by week) ================");
const anchor = startOfWeek(todayStart());
for (const e of team) {
  const wk = computeEmployeeWeeklyCapacity(e, tickets, getEntry, 5, anchor, events);
  console.log(`  ${e.name.padEnd(20)} ` + wk.map((w) => `W${w.weekNumber}:${String(w.utilization).padStart(3)}%`).join("  "));
}

console.log("\n================ DASHBOARD ATTENTION ITEMS ================");
const active = tickets.filter((t) => t.status !== "Completed");
const overdue = active.filter((t) => getDueStatus(ticketDueLabel(t)) === "Overdue");
const dueSoon = active.filter((t) => getDueStatus(ticketDueLabel(t)) === "Due Soon");
const unassigned = active.filter((t) => (t.assignedEmployeeIds ?? []).length === 0);
console.log(`  Active: ${active.length}   Completed: ${tickets.length - active.length}`);
console.log(`  Overdue (${overdue.length}): ${overdue.map((t) => `${t.id} ${t.title} [${(t.assignedEmployeeIds ?? []).map(nameOf).join(",") || "UNASSIGNED"}]`).join(" | ")}`);
console.log(`  Due soon (${dueSoon.length}): ${dueSoon.map((t) => `${t.id} due ${ticketDueLabel(t)}`).join(" | ")}`);
console.log(`  Unassigned (${unassigned.length}): ${unassigned.map((t) => `${t.id} ${t.title}`).join(" | ")}`);
console.log(`  Pending handover: ${(raw.handover as Record<string, unknown>[]).filter((h) => h.status === "Pending Supervisor Review").map((h) => `${h.employeeId} ${h.startDate}-${h.endDate}`).join(" | ")}`);
console.log(`  Pending skill change: ${(raw.skillReqs as Record<string, unknown>[]).filter((s) => s.status === "Pending").map((s) => `${s.employeeId} ${s.kind} ${s.skillName}`).join(" | ")}`);

console.log("\n================ HINAD ABSENCE IMPACT (20–24 Sep 2026) ================");
const hinad = employees.find((e) => e.id === "hinad-alaqeel-mtiuq3hd")!;
const impact = computeAbsenceImpact({ employee: hinad, unitEmployees: team, tickets, startLabel: "20 Sep 2026", endLabel: "24 Sep 2026", getEntry, events });
if (!impact) console.log("  NULL impact!");
else {
  console.log(`  turnover working days: ${impact.turnoverWorkingDays}   deadlines at risk: ${impact.deadlinesAtRisk}   coverage hours: ${impact.totalCoverageHours}h`);
  console.log(`  primary candidate: ${impact.primaryCandidateId ? nameOf(impact.primaryCandidateId) : "none"}`);
  for (const item of impact.affectedWork) {
    console.log(`\n  • ${item.title}  [${item.risk}]  due ${item.dueDate ?? "—"}  remaining ${item.remainingHours}h  coverage-in-window ${item.coverageHours}h`);
    const cands = impact.candidatesByItem.get(item.id) ?? [];
    for (const c of cands) {
      const flag = c.onLeave ? "LEAVE" : !c.assignable ? "BLOCKED" : !c.eligible ? "weak " : "OK   ";
      console.log(`      [${flag}] ${c.employee.name.padEnd(20)} skill ${String(c.skillMatch).padStart(3)}%   window-free ${String(Math.max(0, c.windowAvailableHours)).padStart(5)}h   after-cover ${c.projectedCapacity}%   ${c.excludeReason ?? c.reasons[0] ?? ""}`);
    }
  }
}

console.log("\n================ NEW-TASK CANDIDATE RANKING — DEMO-222 (Shared mailbox permission audit, unassigned) ================");
const demo222 = tickets.find((t) => t.id === "DEMO-222")!;
const ranked = rankCandidatesForTicket(team, demo222, tickets, getEntry, events, team.length);
for (const c of ranked) {
  console.log(`  ${c.employee.name.padEnd(20)} skill ${String(c.skillMatch).padStart(3)}%  peak ${c.peakProjected}%  free-now ${c.availableCapacity}h  ${c.onLeaveNow ? "(on leave now) " : ""}${c.reasons[0] ?? ""}`);
}

console.log("");
