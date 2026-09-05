// Dev-only: verifies Scenario A from the spec — an employee at ~85% this week and ~40%
// next week should absorb a new 10h/2-week-deadline task mostly into NEXT week, not
// this week. Run: node --import ./scripts/paths-hook.mjs scripts/futurecapacity-test.ts
import type { Employee } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import { computeEmployeeWeeklyCapacity, projectedWeeklyTrajectoryForTicket } from "@/lib/capacityEngine";
import { todayStart, addDays, startOfWeek, formatDisplayDate, isWorkingDay } from "@/lib/date";

function fmt(d: Date) {
  return formatDisplayDate(d);
}

// A working day today (so "this week" has real days left to test with).
let today = todayStart();
while (!isWorkingDay(today)) today = addDays(today, 1);

const emp: Employee = {
  id: "test-emp",
  name: "Test Employee",
  department: "IT Service Support",
  level: "Employee",
  supervisorId: null,
  employeeIdNumber: "T1",
  skills: [{ name: "Networking", level: "Advanced" }],
  knowledgeAreas: [],
  workingSchedule: "Full-time · Sun-Thu · 7:00 AM-4:00 PM",
  weeklyHours: 40,
  workload: { project: 0, operational: 0, adhoc: 0, other: 0 },
  currentUtilization: 0,
  upcomingTickets: [],
  adhoc: [],
  leaveEvents: [],
};

// Existing load: one ticket due at the END of this week (~34h, so "this week" lands
// near 85% and "next week" is empty/near 0% before the new ticket).
const endOfThisWeek = addDays(startOfWeek(today), 4); // Thursday
const existing: AssignedTicket = {
  id: "EXIST-1",
  title: "Existing urgent work",
  description: "",
  status: "In Progress",
  priority: "High",
  assignedUnit: "IT Service Support",
  raisedDate: fmt(today),
  estimatedHours: 34,
  slaHours: 999,
  expectedResolutionDate: fmt(endOfThisWeek),
  resolvedDate: null,
  createdBy: "x",
  assignedBy: "x",
  assignedEmployeeIds: [emp.id],
};

const getEntry = () => ({ comments: [] as unknown[] }) as never;
const tickets = [existing];

const before = computeEmployeeWeeklyCapacity(emp, tickets as never, getEntry, 3);
console.log("BEFORE new ticket:");
before.forEach((w) => console.log(`  ${w.label} (${w.rangeLabel}): ${w.utilization}%  (${w.scheduledHours}h / ${w.workingHours}h)`));

// New ticket: 10h, due in 2 weeks.
const deadline = addDays(today, 13);
const newTicket: AssignedTicket = {
  id: "NEW-1",
  title: "New task",
  description: "",
  status: "In Progress",
  priority: "Medium",
  assignedUnit: "IT Service Support",
  raisedDate: fmt(today),
  estimatedHours: 10,
  slaHours: 999,
  expectedResolutionDate: fmt(deadline),
  resolvedDate: null,
  createdBy: "x",
  assignedBy: "x",
  assignedEmployeeIds: [],
};

const { before: b2, after } = projectedWeeklyTrajectoryForTicket(emp, tickets as never, getEntry, newTicket as never, [], 3);
console.log("\nAFTER hypothetically assigning the new 10h/2-week ticket:");
after.forEach((w, i) => console.log(`  ${w.label} (${w.rangeLabel}): ${b2[i].utilization}% -> ${w.utilization}%  (${w.scheduledHours}h / ${w.workingHours}h)`));
