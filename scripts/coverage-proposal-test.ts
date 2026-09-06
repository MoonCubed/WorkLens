// Dev-only: the exact "Propose Mohammed" regression check.
// Reproduces the turnover flow for Njoud AlShareedah's absence 08–13 Sep 2026 with
// "Windows Server 2019 → 2022 upgrade wave" (DEMO-210), computing the impact BEFORE
// and AFTER staging a coverage proposal — the two must agree on remaining effort,
// planned effort during the absence, the coverage requirement, and the candidate's
// projected capacity.
//   node --import ./scripts/paths-hook.mjs scripts/coverage-proposal-test.ts <live.json>
import { readFileSync } from "node:fs";
import type { Employee } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import type { TicketCoverage } from "@/data/tickets";
import type { WorkLogEntry } from "@/store/work-log-store";
import { computeAbsenceImpact } from "@/lib/absenceImpact";
import { todayLabel } from "@/lib/date";

const path = process.argv[2];
if (!path) {
  console.error("usage: node --import ./scripts/paths-hook.mjs scripts/coverage-proposal-test.ts <live.json>");
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
  coverage: (t.coverage as TicketCoverage | null) ?? null,
})) as AssignedTicket[];

const wl = new Map<string, WorkLogEntry>();
for (const r of raw.workLog as Record<string, unknown>[]) {
  wl.set(`${r.employeeId}:${r.itemId}`, {
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
const getEntry = (k: string): WorkLogEntry => wl.get(k) ?? { comments: [] };
const events = (raw.calEvents as Record<string, unknown>[]).map((e) => ({ ...e })) as never[];

const team = employees.filter((e) => e.level !== "Supervisor");
const njoud = employees.find((e) => e.name.startsWith("Njoud"))!;
const mohammed = employees.find((e) => e.name.startsWith("Mohammed"))!;
const ITEM = "DEMO-210";
const START = "08 Sep 2026";
const END = "13 Sep 2026";

function snapshot(stagedCoverage?: Record<string, TicketCoverage>) {
  const impact = computeAbsenceImpact({
    employee: njoud, unitEmployees: team, tickets, startLabel: START, endLabel: END, getEntry, events,
    stagedCoverage,
  })!;
  const item = impact.affectedWork.find((i) => i.ticketId === ITEM)!;
  const mo = impact.candidatesByItem.get(item.id)!.find((c) => c.employee.id === mohammed.id)!;
  return {
    remaining: item.remainingHours,
    plannedDuringAbsence: item.coverageHours,
    coveragePlanHours: impact.coveragePlanByItem.get(item.id)?.hours ?? null,
    moFree: mo.windowAvailableHours,
    moUtil: mo.utilization,
    moProjected: mo.projectedCapacity,
  };
}

const before = snapshot();
console.log("BEFORE proposal:");
console.table(before);

// Stage exactly what the "Propose Mohammed" button would: the frozen plan for DEMO-210.
const plan = computeAbsenceImpact({
  employee: njoud, unitEmployees: team, tickets, startLabel: START, endLabel: END, getEntry, events,
})!.coveragePlanByItem.get(ITEM)!;
const staged: Record<string, TicketCoverage> = {
  [ITEM]: {
    coveringEmployeeId: mohammed.id, ownerId: njoud.id, ownerName: njoud.name, coveringName: mohammed.name,
    startDate: START, endDate: END, allocations: plan.allocations, hours: plan.hours, createdAt: todayLabel(),
  },
};

const after = snapshot(staged);
console.log("\nAFTER proposing Mohammed:");
console.table(after);

// Reopen scenario: coverage already APPLIED (persisted on the ticket), no staging.
const applied = tickets.map((t) => (t.id === ITEM ? { ...t, coverage: staged[ITEM] } : t));
const reopenImpact = computeAbsenceImpact({
  employee: njoud, unitEmployees: team, tickets: applied, startLabel: START, endLabel: END, getEntry, events,
})!;
const rItem = reopenImpact.affectedWork.find((i) => i.ticketId === ITEM)!;
const rMo = reopenImpact.candidatesByItem.get(rItem.id)!.find((c) => c.employee.id === mohammed.id)!;
const reopen = {
  remaining: rItem.remainingHours,
  plannedDuringAbsence: rItem.coverageHours,
  coveragePlanHours: reopenImpact.coveragePlanByItem.get(rItem.id)?.hours ?? null,
  moFree: rMo.windowAvailableHours,
  moProjected: rMo.projectedCapacity,
};
console.log("\nREOPENED (coverage already applied on the ticket):");
console.table(reopen);

const near = (a: number, b: number, tol = 0.15) => Math.abs(a - b) <= tol;
const checks: [string, boolean][] = [
  ["Remaining effort unchanged (27h)", near(before.remaining, after.remaining) && near(after.remaining, 27, 2)],
  ["Planned effort during absence unchanged", near(before.plannedDuringAbsence, after.plannedDuringAbsence)],
  ["Planned effort during absence << remaining", after.plannedDuringAbsence < after.remaining * 0.5],
  ["Coverage plan hours unchanged", near(before.coveragePlanHours ?? -1, after.coveragePlanHours ?? -2)],
  ["Mohammed free-in-window unchanged", near(before.moFree, after.moFree, 0.5)],
  ["Mohammed projected capacity unchanged", near(before.moProjected, after.moProjected, 2)],
  ["Mohammed projected capacity is sane (< 100%)", after.moProjected < 100],
  ["Proposal jump is small (planned, not remaining)", after.moProjected - after.moUtil < 20],
  ["Reopen: planned-during-absence not inflated", near(reopen.plannedDuringAbsence, before.plannedDuringAbsence)],
  ["Reopen: remaining still total (27h)", near(reopen.remaining, 27, 2)],
  ["Reopen: Mohammed projection still sane (< 100%)", reopen.moProjected < 100],
];

console.log("");
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "  PASS" : "  FAIL"}  ${name}`);
  if (!pass) ok = false;
}
console.log(ok ? "\n✅ coverage proposal is stable" : "\n❌ coverage proposal regressed");
process.exitCode = ok ? 0 : 1;
