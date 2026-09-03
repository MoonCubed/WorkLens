// Dev-only: exercises the turnover analysis with the seeded demo data.
// Run: node --import ./scripts/paths-hook.mjs scripts/handovercheck.ts
import { EMPLOYEES } from "@/data/employees";
import { TICKETS } from "@/data/tickets";
import { getUnitTeam } from "@/lib/hr";
import { computeAbsenceImpact } from "@/lib/absenceImpact";

const getEntry = () => ({ comments: [] as unknown[] }) as never;
const tickets = TICKETS.map((t) => ({ ...t })) as never[];
const unit = getUnitTeam("IT Service Support", EMPLOYEES);
const layla = EMPLOYEES.find((e) => e.id === "layla-al-zahrani")!;

const impact = computeAbsenceImpact({
  employee: layla,
  unitEmployees: unit,
  tickets,
  startLabel: "13 Sep 2026",
  endLabel: "17 Sep 2026",
  getEntry,
});

if (!impact) {
  console.log("no impact");
  process.exit(1);
}

console.log(`Layla leave 13–17 Sep · ${impact.turnoverWorkingDays} working days · ${impact.totalCoverageHours}h to cover`);
console.log(`Affected work: ${impact.affectedWork.length} · deadlines at risk: ${impact.deadlinesAtRisk}\n`);

for (const item of impact.affectedWork) {
  console.log(`• ${item.title}  [${item.risk}]  due ${item.dueDate}  remaining ${item.remainingHours}h  coverage ${item.coverageHours}h  turnover ${item.turnoverStart}–${item.turnoverEnd} (${item.turnoverWorkingDays}d)`);
  const cands = impact.candidatesByItem.get(item.id) ?? [];
  for (const c of cands) {
    const flag = c.onLeave ? "LEAVE" : c.eligible ? "OK   " : c.overloaded ? "FULL " : "skill";
    console.log(`    [${flag}] ${c.employee.name.padEnd(20)} window free ${String(c.windowAvailableHours).padStart(5)}h  ${c.utilization}%→${c.projectedCapacity}%  skill ${c.skillMatch}%`);
  }
  console.log();
}
console.log("primary candidate:", impact.primaryCandidateId);
