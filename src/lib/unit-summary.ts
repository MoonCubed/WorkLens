import type { Department, Employee } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import { getCapacityStatus } from "@/lib/capacity";
import { ticketDueLabel, adhocDueLabel, seedTicketDueLabel } from "@/lib/due";
import { todayStart, startOfWeek, weekOfYear } from "@/lib/date";

export interface UnitSummary {
  employees: Employee[];
  employeeCount: number;
  averageUtilization: number;
  availableCapacity: number;
  atRiskCount: number;
  overloadedCount: number;
  activeTasksCount: number;
  openTicketsCount: number;
  forecast8Week: { week: string; utilization: number }[];
}

export function getEmployeeWorkCounts(employee: Employee) {
  const tickets = employee.upcomingTickets.length;
  const adhoc = employee.adhoc.length;
  return { tickets, adhoc, activeTasks: tickets + adhoc };
}

export interface EmployeeTask {
  key: string;
  type: "Ticket" | "Ad-hoc";
  name: string;
  priority: "High" | "Medium" | "Low";
  deadline: string;
}

/** Every task currently on an employee's plate — seed tickets/ad-hoc plus any ticket
 * assigned to them via the WorkLens Work queue (the tickets-store bridge). */
export function getEmployeeTasks(employee: Employee, tickets: AssignedTicket[]): EmployeeTask[] {
  return [
    ...employee.upcomingTickets.map((t) => ({ key: `t-${t.id}`, type: "Ticket" as const, name: t.title, priority: t.priority, deadline: seedTicketDueLabel(t) })),
    ...employee.adhoc.map((a) => ({ key: `a-${a.id}`, type: "Ad-hoc" as const, name: a.name, priority: a.priority, deadline: adhocDueLabel(a) })),
    ...tickets
      .filter((t) => (t.assignedEmployeeIds ?? []).includes(employee.id))
      .map((t) => ({ key: `at-${t.id}`, type: "Ticket" as const, name: t.title, priority: t.priority, deadline: ticketDueLabel(t) })),
  ];
}

export function computeUnitSummary(unit: Department, employees: Employee[], tickets: AssignedTicket[]): UnitSummary {
  const unitEmployees = employees.filter((e) => e.department === unit);
  const count = unitEmployees.length || 1;

  const averageUtilization = Math.round(
    unitEmployees.reduce((sum, e) => sum + e.currentUtilization, 0) / count
  );
  const availableCapacity = Math.max(0, Math.round(100 - averageUtilization));

  let atRiskCount = 0;
  let overloadedCount = 0;
  let activeTasksCount = 0;

  unitEmployees.forEach((e) => {
    const status = getCapacityStatus(e.currentUtilization).key;
    if (status === "atRisk") atRiskCount += 1;
    if (status === "overloaded" || status === "critical") overloadedCount += 1;
    activeTasksCount += e.upcomingTickets.length + e.adhoc.length;
  });

  const openTicketsCount = tickets.filter(
    (t) => t.assignedUnit === unit && t.status !== "Completed"
  ).length;

  const forecastWeekStart = startOfWeek(todayStart());
  const forecast8Week = Array.from({ length: 8 }, (_, weekIdx) => {
    const values = unitEmployees.map((e) => e.forecast8Week[weekIdx] ?? e.currentUtilization);
    const avg = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
    const weekDate = new Date(
      forecastWeekStart.getFullYear(),
      forecastWeekStart.getMonth(),
      forecastWeekStart.getDate() + weekIdx * 7
    );
    return { week: `Week ${weekOfYear(weekDate)}`, utilization: avg };
  });

  return {
    employees: unitEmployees,
    employeeCount: unitEmployees.length,
    averageUtilization,
    availableCapacity,
    atRiskCount,
    overloadedCount,
    activeTasksCount,
    openTicketsCount,
    forecast8Week,
  };
}
