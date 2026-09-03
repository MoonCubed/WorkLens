// Dev-only: applies the demo turnover coverage in-memory and checks both schedules.
// Run: node --import ./scripts/paths-hook.mjs scripts/coveragecheck.ts
import { EMPLOYEES } from "@/data/employees";
import { TICKETS } from "@/data/tickets";
import type { TicketCoverage } from "@/data/tickets";
import { getUnitTeam } from "@/lib/hr";
import { computeAbsenceImpact } from "@/lib/absenceImpact";
import { computeEmployeeCapacity, computeEmployeeWeeklyCapacity, computeEmployeeSchedule } from "@/lib/capacityEngine";

const getEntry = () => ({ comments: [] as unknown[] }) as never;
const tickets = TICKETS.map((t) => ({ ...t })) as { id: string; coverage?: TicketCoverage | null; assignedEmployeeIds?: string[] }[];
const unit = getUnitTeam("IT Service Support", EMPLOYEES);
const layla = EMPLOYEES.find((e) => e.id === "layla-al-zahrani")!;
const tariq = EMPLOYEES.find((e) => e.id === "tariq-al-mutairi")!;

const impact = computeAbsenceImpact({
  employee: layla, unitEmployees: unit, tickets: tickets as never, startLabel: "13 Sep 2026", endLabel: "17 Sep 2026", getEntry,
});
if (!impact) process.exit(1);

// Apply coverage for every ticket affected -> Tariq
for (const item of impact.affectedWork) {
  if (!item.ticketId) continue;
  const plan = impact.coveragePlanByItem.get(item.id)!;
  const t = tickets.find((x) => x.id === item.ticketId)!;
  t.coverage = {
    coveringEmployeeId: tariq.id, ownerId: layla.id, ownerName: layla.name, coveringName: tariq.name,
    startDate: "13 Sep 2026", endDate: "17 Sep 2026", allocations: plan.allocations, hours: plan.hours, createdAt: "03 Sep 2026",
  };
  console.log(`coverage set on ${t.id}: ${plan.allocations.length} days, ${plan.hours}h  [${plan.allocations.map((a) => a.dateKey).join(", ")}]`);
}

function wk(e: typeof layla) {
  return computeEmployeeWeeklyCapacity(e, tickets as never, getEntry, 4).map((w) => `${w.utilization}%`).join(" ");
}
console.log(`\nLayla  now ${computeEmployeeCapacity(layla, tickets as never, getEntry).utilization}%  wk ${wk(layla)}`);
console.log(`Tariq  now ${computeEmployeeCapacity(tariq, tickets as never, getEntry).utilization}%  wk ${wk(tariq)}`);

const ts = computeEmployeeSchedule(tariq, tickets as never, getEntry);
console.log("\nTariq schedule items:");
for (const i of ts.items) console.log(`  ${i.isCoverage ? "[COVER] " : "        "}${i.title.padEnd(38)} ${i.dailyHours}h/day  days ${i.workingDayKeys.length}${i.coveredAway ? "  (coveredAway)" : ""}`);

const ls = computeEmployeeSchedule(layla, tickets as never, getEntry);
console.log("\nLayla schedule items (owner):");
for (const i of ls.items) console.log(`  ${i.title.padEnd(38)} ${i.dailyHours}h/day  days ${i.workingDayKeys.length}${i.coveredAway ? `  covered ${i.coveredAway.hours}h by ${i.coveredAway.coveringName}` : ""}`);
