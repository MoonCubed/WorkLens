// Dev-only: verifies rankCandidatesForTicket doesn't penalize a candidate who's busy
// THIS week but has room before the ticket's deadline, vs one who's busy throughout.
// Run: node --import ./scripts/paths-hook.mjs scripts/ranking-test.ts
import type { Employee } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import { rankCandidatesForTicket } from "@/lib/ticketMatch";
import { todayStart, addDays, startOfWeek, formatDisplayDate, isWorkingDay } from "@/lib/date";

let today = todayStart();
while (!isWorkingDay(today)) today = addDays(today, 1);
const fmt = (d: Date) => formatDisplayDate(d);

function makeEmp(id: string, name: string): Employee {
  return {
    id, name, department: "IT Service Support", level: "Employee", supervisorId: null, employeeIdNumber: id,
    skills: [{ name: "Networking", level: "Advanced" }], knowledgeAreas: [], workingSchedule: "Full-time · Sun-Thu · 7:00 AM-4:00 PM",
    weeklyHours: 40, workload: { project: 0, operational: 0, adhoc: 0, other: 0 }, currentUtilization: 0,
    upcomingTickets: [], adhoc: [], leaveEvents: [],
  };
}

const busyNowFreeLater = makeEmp("a", "Busy Now Free Later");
const busyThroughout = makeEmp("b", "Busy Throughout");

const endOfThisWeek = addDays(startOfWeek(today), 4);
const endOfNextTwoWeeks = addDays(today, 13);

const existingForA: AssignedTicket = {
  id: "A-EXIST", title: "A existing", description: "", status: "In Progress", priority: "High",
  assignedUnit: "IT Service Support", raisedDate: fmt(today), estimatedHours: 34, slaHours: 999,
  expectedResolutionDate: fmt(endOfThisWeek), resolvedDate: null, createdBy: "x", assignedBy: "x",
  assignedEmployeeIds: [busyNowFreeLater.id],
};
const existingForB: AssignedTicket = {
  id: "B-EXIST", title: "B existing", description: "", status: "In Progress", priority: "High",
  assignedUnit: "IT Service Support", raisedDate: fmt(today), estimatedHours: 68, slaHours: 999,
  expectedResolutionDate: fmt(endOfNextTwoWeeks), resolvedDate: null, createdBy: "x", assignedBy: "x",
  assignedEmployeeIds: [busyThroughout.id],
};

const newTicket: AssignedTicket = {
  id: "NEW", title: "New unassigned ticket", description: "networking work", status: "In Progress", priority: "Medium",
  assignedUnit: "IT Service Support", raisedDate: fmt(today), estimatedHours: 10, slaHours: 999,
  expectedResolutionDate: fmt(endOfNextTwoWeeks), resolvedDate: null, createdBy: "x", assignedBy: "x",
  assignedEmployeeIds: [], relatedSkills: ["Networking"],
};

const getEntry = () => ({ comments: [] as unknown[] }) as never;
const tickets = [existingForA, existingForB];

const ranked = rankCandidatesForTicket([busyNowFreeLater, busyThroughout], newTicket, tickets as never, getEntry, [], 5);
ranked.forEach((c, i) => {
  console.log(`#${i + 1} ${c.employee.name}: peakProjected=${c.peakProjected}%  thisWeek(before/after)=${c.weeklyTrajectory[0]?.before}/${c.weeklyTrajectory[0]?.utilization}`);
  c.reasons.forEach((r) => console.log(`     - ${r}`));
});
console.log(ranked[0]?.employee.id === busyNowFreeLater.id ? "\nPASS: busy-now-free-later ranked first" : "\nFAIL: expected busy-now-free-later to rank first");
