// Dev-only: verifies Scenario E — no task/event segment overlaps 11:30-12:30.
// Run: node --import ./scripts/paths-hook.mjs scripts/lunch-test.ts
import type { Employee } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import { computeEmployeeSchedule } from "@/lib/capacityEngine";
import { buildDayTimeline, minLabel, LUNCH_START_MIN, LUNCH_END_MIN } from "@/lib/dayTimeline";
import { todayStart, addDays, isWorkingDay, formatDisplayDate } from "@/lib/date";

let today = todayStart();
while (!isWorkingDay(today)) today = addDays(today, 1);

const emp: Employee = {
  id: "e1", name: "Test", department: "IT Service Support", level: "Employee", supervisorId: null, employeeIdNumber: "T1",
  skills: [], knowledgeAreas: [], workingSchedule: "Full-time · Sun-Thu · 7:00 AM-4:00 PM", weeklyHours: 40,
  workload: { project: 0, operational: 0, adhoc: 0, other: 0 }, currentUtilization: 0, upcomingTickets: [],
  adhoc: [{ id: "a1", name: "Heavy ongoing work", priority: "High", deadline: "Ongoing", estimatedHours: 8, status: "Open" }],
  leaveEvents: [],
};
const tickets: AssignedTicket[] = [];
const getEntry = () => ({ comments: [] as unknown[] }) as never;

const schedule = computeEmployeeSchedule(emp, tickets, getEntry, []);
const tl = buildDayTimeline(schedule, emp, today);

console.log(`Lunch window: ${minLabel(LUNCH_START_MIN)}-${minLabel(LUNCH_END_MIN)}\n`);
console.log(`${formatDisplayDate(today)} timeline:`);
let violation = false;
for (const seg of tl.segments) {
  console.log(`  ${minLabel(seg.startMin)}-${minLabel(seg.endMin)}  [${seg.kind}]  ${seg.title}`);
  if (seg.kind !== "lunch" && seg.startMin < LUNCH_END_MIN && seg.endMin > LUNCH_START_MIN) violation = true;
}
console.log(violation ? "\nFAIL: something overlaps the lunch window" : "\nPASS: nothing overlaps the lunch window");
