// Dev-only: verifies Scenario D — a 09:00-10:00 calendar event removes 1h of available
// working time and is reflected in capacity/scheduling.
// Run: node --import ./scripts/paths-hook.mjs scripts/calendarevent-test.ts
import type { Employee } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import type { CalendarEvent } from "@/store/calendar-events-store";
import { computeEmployeeCapacity, computeEmployeeSchedule } from "@/lib/capacityEngine";
import { todayStart, addDays, startOfWeek, isWorkingDay, formatDisplayDate } from "@/lib/date";

let today = todayStart();
while (!isWorkingDay(today)) today = addDays(today, 1);

// A working day within the CURRENT calendar week (Sun–Thu), regardless of whether
// it's already passed — `weeklyWorkingHoursForWeek` looks at the whole week, not just
// "from today onward".
let weekEventDay = startOfWeek(todayStart());
while (!isWorkingDay(weekEventDay)) weekEventDay = addDays(weekEventDay, 1);

const emp: Employee = {
  id: "e1", name: "Test", department: "IT Service Support", level: "Employee", supervisorId: null, employeeIdNumber: "T1",
  skills: [], knowledgeAreas: [], workingSchedule: "Full-time · Sun-Thu · 7:00 AM-4:00 PM", weeklyHours: 40,
  workload: { project: 0, operational: 0, adhoc: 0, other: 0 }, currentUtilization: 0, upcomingTickets: [],
  adhoc: [{ id: "a1", name: "Ongoing work", priority: "Medium", deadline: "Ongoing", estimatedHours: 30, status: "Open" }],
  leaveEvents: [],
};
const tickets: AssignedTicket[] = [];
const getEntry = () => ({ comments: [] as unknown[] }) as never;

const noEvents: CalendarEvent[] = [];
const withEvent: CalendarEvent[] = [
  { id: "ev1", authorId: emp.id, authorName: emp.name, authorRole: "employee", department: "IT Service Support", title: "Client Meeting", date: formatDisplayDate(weekEventDay), priority: "Medium", itemType: "Appointment", note: "", createdAt: formatDisplayDate(weekEventDay), startTime: "09:00", endTime: "10:00" },
];

const before = computeEmployeeCapacity(emp, tickets, getEntry, noEvents);
const after = computeEmployeeCapacity(emp, tickets, getEntry, withEvent);
console.log(`Working hours this week: ${before.workingHours}h -> ${after.workingHours}h (expect -1h)`);
console.log(`Available hours: ${before.availableHours}h -> ${after.availableHours}h`);

// Day-level check: event dated on the actual next working day (`today`).
const withEventToday: CalendarEvent[] = [
  { id: "ev2", authorId: emp.id, authorName: emp.name, authorRole: "employee", department: "IT Service Support", title: "Client Meeting", date: formatDisplayDate(today), priority: "Medium", itemType: "Appointment", note: "", createdAt: formatDisplayDate(today), startTime: "09:00", endTime: "10:00" },
];
const planBefore = computeEmployeeSchedule(emp, tickets, getEntry, noEvents).planForRange(today, 1)[0];
const planAfter = computeEmployeeSchedule(emp, tickets, getEntry, withEventToday).planForRange(today, 1)[0];
console.log(`\n${formatDisplayDate(today)} availableHours (day plan): ${planBefore?.availableHours}h -> ${planAfter?.availableHours}h (expect -1h)`);
console.log(`${formatDisplayDate(today)} planned task hours: ${planBefore?.totalHours}h -> ${planAfter?.totalHours}h (should shift away from the meeting day if there's slack elsewhere)`);
console.log(
  before.workingHours - after.workingHours === 1 && (planBefore?.availableHours ?? 0) - (planAfter?.availableHours ?? 0) === 1
    ? "PASS"
    : "CHECK"
);
