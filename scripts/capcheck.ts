// Dev-only: prints computed weekly utilization for every seeded employee, using the
// REAL capacity engine + seed data, so demo data can be tuned to a realistic spread.
// Run: node --import ./scripts/paths-hook.mjs scripts/capcheck.ts
import { EMPLOYEES } from "@/data/employees";
import { TICKETS } from "@/data/tickets";
import { computeEmployeeCapacity, computeEmployeeWeeklyCapacity } from "@/lib/capacityEngine";
import { getUnitTeam } from "@/lib/hr";

const getEntry = () => ({ comments: [] as unknown[] }) as never;
const tickets = TICKETS.map((t) => ({ ...t })) as never[];

function line(e: (typeof EMPLOYEES)[number]) {
  const c = computeEmployeeCapacity(e, tickets, getEntry);
  const wk = computeEmployeeWeeklyCapacity(e, tickets, getEntry, 4);
  const wkStr = wk.map((w) => `${w.utilization}%`).join(" ");
  const assigned = tickets.filter((t: never) => ((t as { assignedEmployeeIds?: string[] }).assignedEmployeeIds ?? []).includes(e.id)).length;
  return `${String(c.utilization).padStart(4)}%  now[${wkStr}]  sched ${String(c.activeHours).padStart(5)}h  avail ${String(c.availableHours).padStart(5)}h  tkts:${assigned} ${e.level === "Supervisor" ? "[sup] " : "      "}${e.name}${c.onLeave ? " (ON LEAVE)" : ""}`;
}

console.log("=== IT Service Support ===");
console.log("  now util | next 4 weeks util");
for (const e of EMPLOYEES.filter((e) => e.department === "IT Service Support")) console.log(line(e));

console.log("\n=== Rest of org ===");
for (const e of EMPLOYEES.filter((e) => e.department !== "IT Service Support")) console.log(line(e));

console.log("\n--- IT Service Support TEAM (getUnitTeam) ---");
for (const e of getUnitTeam("IT Service Support", EMPLOYEES)) console.log(line(e));
