// Dev-only: verifies the time-based Plan My Day frame + auto-arrange —
//   * free intervals never touch lunch or a timed calendar event
//   * every free/placed boundary sits on the 30-minute grid
//   * a confirmed plan is echoed back verbatim by buildDayTimeline
// Run: node --import ./scripts/paths-hook.mjs scripts/planday-time-test.ts
import type { Employee } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import type { CalendarEvent } from "@/store/calendar-events-store";
import type { DayPlan } from "@/store/day-plans-store";
import { computeEmployeeSchedule } from "@/lib/capacityEngine";
import { buildDayFrame, autoArrange } from "@/lib/planDay";
import { buildDayTimeline } from "@/lib/dayTimeline";
import { minToTime } from "@/lib/increments";
import { todayStart, addDays, isWorkingDay, formatDisplayDate, dateKey } from "@/lib/date";

let today = todayStart();
while (!isWorkingDay(today)) today = addDays(today, 1);

const emp: Employee = {
  id: "e1", name: "Test", department: "IT Service Support", level: "Employee", supervisorId: null, employeeIdNumber: "T1",
  skills: [], knowledgeAreas: [], workingSchedule: "Full-time · Sun-Thu · 7:00 AM-4:00 PM", weeklyHours: 40,
  workload: { project: 0, operational: 0, adhoc: 0, other: 0 }, currentUtilization: 0, upcomingTickets: [],
  adhoc: [
    { id: "a1", name: "Project A", priority: "High", deadline: "Ongoing", estimatedHours: 6, status: "Open" },
    { id: "a2", name: "Project B", priority: "Medium", deadline: "Ongoing", estimatedHours: 4, status: "Open" },
  ],
  leaveEvents: [],
};
const tickets: AssignedTicket[] = [];
const events: CalendarEvent[] = [
  { id: "ev1", authorId: "e1", authorName: "Test", authorRole: "employee", department: "IT Service Support", title: "Standup", date: formatDisplayDate(today), priority: "Medium", itemType: "Appointment", note: "", startTime: "09:00", endTime: "09:30", createdAt: "" },
];
const getEntry = () => ({ comments: [] as unknown[] }) as never;

let ok = true;
const frame = buildDayFrame(emp, tickets, getEntry, events, today);
console.log(`Working window: ${minToTime(frame.workStartMin)}–${minToTime(frame.workEndMin)}`);
console.log("Fixed:", frame.fixed.map((f) => `${minToTime(f.startMin)}–${minToTime(f.endMin)} ${f.title}`).join(", "));
console.log("Free :", frame.free.map((g) => `${minToTime(g.startMin)}–${minToTime(g.endMin)}`).join(", "));

for (const g of frame.free) {
  if (g.startMin % 30 !== 0 || g.endMin % 30 !== 0) { ok = false; console.log("FAIL: free interval off the 30-min grid", g); }
  // must not overlap lunch 11:30–12:30
  if (g.startMin < 12 * 60 + 30 && g.endMin > 11 * 60 + 30) { ok = false; console.log("FAIL: free interval overlaps lunch", g); }
  // must not overlap the 09:00–09:30 event
  if (g.startMin < 9 * 60 + 30 && g.endMin > 9 * 60) { ok = false; console.log("FAIL: free interval overlaps the calendar event", g); }
}

const { placed, overflowKeys } = autoArrange(frame, [
  { key: "e1:a1", minutes: 150 },
  { key: "e1:a2", minutes: 90 },
]);
console.log("\nAuto-arranged:");
placed.forEach((p) => console.log(`  ${p.key}  ${minToTime(p.startMin)}–${minToTime(p.endMin)}`));
if (overflowKeys.length) console.log("  overflow:", overflowKeys.join(", "));
for (const p of placed) {
  if (p.startMin % 30 !== 0 || p.endMin % 30 !== 0) { ok = false; console.log("FAIL: placed block off the 30-min grid", p); }
  const insideFree = frame.free.some((g) => p.startMin >= g.startMin && p.endMin <= g.endMin);
  if (!insideFree) { ok = false; console.log("FAIL: placed block not inside a free interval", p); }
}

// A confirmed plan is echoed back by buildDayTimeline unchanged.
const schedule = computeEmployeeSchedule(emp, tickets, getEntry, events);
const plan: DayPlan = {
  id: `e1:${dateKey(today)}`,
  employeeId: "e1",
  date: dateKey(today),
  availableHours: frame.availableHours,
  allocations: [
    { key: "e1:a1", title: "Project A", hours: 2, startTime: "08:00", endTime: "10:00", status: "In Progress", ticketId: null },
    { key: "e1:a2", title: "Project B", hours: 1.5, startTime: "12:30", endTime: "14:00", status: "In Progress", ticketId: null },
  ],
  note: "",
  createdAt: "",
  confirmedAt: null,
};
const tl = buildDayTimeline(schedule, emp, today, plan);
const taskSegs = tl.segments.filter((s) => s.kind === "task");
console.log("\nConfirmed-plan timeline task blocks:");
taskSegs.forEach((s) => console.log(`  ${minToTime(s.startMin)}–${minToTime(s.endMin)}  ${s.title}`));
if (!tl.fromConfirmedPlan) { ok = false; console.log("FAIL: timeline did not use the confirmed plan"); }
if (taskSegs.length !== 2) { ok = false; console.log("FAIL: expected 2 task blocks from the plan"); }
if (!taskSegs.some((s) => s.startMin === 8 * 60 && s.endMin === 10 * 60)) { ok = false; console.log("FAIL: 08:00–10:00 block missing"); }

console.log(ok ? "\nPASS" : "\nFAIL");
process.exitCode = ok ? 0 : 1;
