import type { Employee } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import { ticketDueLabel, adhocDueLabel, seedTicketDueLabel } from "@/lib/due";

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

/** Every active task currently on an employee's plate — seed tickets/ad-hoc plus any
 * non-completed ticket assigned to them via the WorkLens Work queue (the tickets-store
 * bridge). */
export function getEmployeeTasks(employee: Employee, tickets: AssignedTicket[]): EmployeeTask[] {
  return [
    ...employee.upcomingTickets.map((t) => ({ key: `t-${t.id}`, type: "Ticket" as const, name: t.title, priority: t.priority, deadline: seedTicketDueLabel(t) })),
    ...employee.adhoc.map((a) => ({ key: `a-${a.id}`, type: "Ad-hoc" as const, name: a.name, priority: a.priority, deadline: adhocDueLabel(a) })),
    ...tickets
      .filter((t) => (t.assignedEmployeeIds ?? []).includes(employee.id) && t.status !== "Completed")
      .map((t) => ({ key: `at-${t.id}`, type: "Ticket" as const, name: t.title, priority: t.priority, deadline: ticketDueLabel(t) })),
  ];
}
