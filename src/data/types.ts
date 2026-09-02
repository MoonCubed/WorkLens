export type Department =
  | "Data & Analytics"
  | "Digital Solutions"
  | "Business Systems"
  | "Cybersecurity"
  | "IT Service Support"
  | "Applications";

/** A "unit" is the same organizational grouping as a Department, named for contexts
 * (supervisor login, ticket routing) where "unit" is the more natural term. */
export type Unit = Department;

// Task lifecycle everywhere in the app is just these three states.
export type WorkflowStatus = "In Progress" | "On Hold" | "Completed";

export type SkillLevel = "Beginner" | "Intermediate" | "Advanced" | "Expert";

export interface Skill {
  name: string;
  level: SkillLevel;
}

export interface WorkloadBreakdown {
  project: number;
  operational: number;
  adhoc: number;
  other: number;
}

export interface UpcomingTicket {
  id: string;
  title: string;
  priority: "High" | "Medium" | "Low";
  deadline: string;
  estimatedHours: number;
  status: "Open" | "In Progress" | "Queued";
}

export interface AdhocItem {
  id: string;
  name: string;
  priority: "High" | "Medium" | "Low";
  deadline: string;
  estimatedHours: number;
  status: "Open" | "In Progress" | "Queued";
}

export interface LeaveEvent {
  id: string;
  /** New handover/leave requests use the single generic type "Leave"; the other
   * values only still appear on older seeded leave records. */
  type: "Leave" | "Annual Leave" | "Public Holiday" | "Training" | "Sick Leave";
  start: string;
  end: string;
  /** Missing on older/seeded records — treat as already approved (historical data).
   * New leave requests submitted by an employee start out "Pending" until HR approves them. */
  status?: "Approved" | "Pending";
}

export type EmployeeLevel = "Supervisor" | "Employee";

export interface Employee {
  id: string;
  name: string;
  department: Department;
  /** One "Supervisor" per department is the default supervisor new hires in that
   * department are linked to (see `getDepartmentSupervisor` in lib/hr.ts). */
  level: EmployeeLevel;
  supervisorId: string | null;
  employeeIdNumber: string;
  /** Editable via the HR System's employee profile; falls back to a derived address when unset. */
  email?: string;
  /** Editable via the HR System's employee profile; falls back to a derived status when unset. */
  availabilityOverride?: "Available" | "Unavailable";
  skills: Skill[];
  knowledgeAreas: string[];
  workingSchedule: string;
  weeklyHours: number;
  workload: WorkloadBreakdown;
  currentUtilization: number;
  upcomingTickets: UpcomingTicket[];
  adhoc: AdhocItem[];
  leaveEvents: LeaveEvent[];
}
