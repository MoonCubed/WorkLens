import type { Department, Employee } from "@/data/types";
import { todayStart, parseLooseDate } from "@/lib/date";
import { OVERLOAD_THRESHOLD } from "@/data/config";

/** The one "Supervisor"-level employee in a department — new hires in that department
 * are linked to them as their supervisor by default. Data-driven off `level`, so
 * promoting someone to Supervisor on their HR profile is what makes them the default. */
export function getDepartmentSupervisor(department: Department, employees: Employee[]): Employee | undefined {
  return employees.find((e) => e.department === department && e.level === "Supervisor");
}

/** Always derived live from the department's current Supervisor — never overridable
 * per-employee, so a supervisor change (see `getDepartmentSupervisor`) is reflected
 * for everyone who reports to them the moment it happens, with no stale per-employee
 * snapshot to go out of sync. A Supervisor is the top of their department's chain in
 * this demo, so they have no supervisor of their own. */
export function getSupervisorName(employee: Pick<Employee, "level" | "department">, employees: Employee[]): string {
  if (employee.level === "Supervisor") return "—";
  const supervisor = getDepartmentSupervisor(employee.department, employees);
  return supervisor?.name ?? "—";
}

/** The people a supervisor is responsible for — everyone in the unit except the
 * supervisor themselves. A supervisor owns the team's capacity; they are not a
 * team member, don't get work assigned to them, and don't count toward team
 * capacity totals. This is the one filter every team view should use. */
export function getUnitTeam(unit: Department, employees: Employee[]): Employee[] {
  return employees.filter((e) => e.department === unit && e.level !== "Supervisor");
}

/** True when this employee is a supervisor (of any unit) — used to keep them out
 * of assignee pickers and team lists. */
export function isSupervisor(employee: Pick<Employee, "level">): boolean {
  return employee.level === "Supervisor";
}

export function getEmployeeEmail(employee: Pick<Employee, "name" | "email">): string {
  if (employee.email) return employee.email;
  const first = employee.name.split(" ")[0].toLowerCase();
  return `${first}@worklens-demo.example`;
}

export type AvailabilityStatus = "Available" | "Unavailable" | "Limited";

export function getAvailabilityStatus(employee: Employee): AvailabilityStatus {
  if (employee.availabilityOverride) return employee.availabilityOverride;
  const today = todayStart();
  const onLeaveNow = employee.leaveEvents.some((leave) => {
    const start = parseLooseDate(leave.start);
    const end = parseLooseDate(leave.end);
    if (!start || !end) return false;
    return today >= start && today <= end;
  });
  if (onLeaveNow) return "Unavailable";
  if (employee.currentUtilization > OVERLOAD_THRESHOLD) return "Limited";
  return "Available";
}
