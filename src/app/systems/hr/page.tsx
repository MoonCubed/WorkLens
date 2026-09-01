"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Crown, Plus, Download, Trash2, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { SourceSystemHeader, SourceSystemNotice } from "@/components/systems/SourceSystemHeader";
import { SystemPageShell } from "@/components/systems/SystemPageShell";
import { ClickableRow } from "@/components/systems/ClickableRow";
import { EmployeeLeaveCalendar } from "@/components/systems/EmployeeLeaveCalendar";
import { DeleteEmployeeModal } from "@/components/systems/DeleteEmployeeModal";
import { getSourceSystem } from "@/data/systems";
import { IT_DEPARTMENTS } from "@/data/config";
import type { Department, Employee, EmployeeLevel } from "@/data/types";
import { getAvailabilityStatus, getDepartmentSupervisor, getSupervisorName } from "@/lib/hr";
import { useEmployees } from "@/store/employees-store";
import { useHandoverRequests } from "@/store/handover-requests-store";

const AVAILABILITY_STYLES: Record<string, string> = {
  Available: "bg-[var(--status-good-bg)] border-[var(--status-good-border)] text-[var(--status-good)]",
  Unavailable: "bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning)]",
  Limited: "bg-[var(--status-serious-bg)] border-[var(--status-serious-border)] text-[var(--status-serious)]",
};

const LEVEL_STYLES: Record<EmployeeLevel, string> = {
  Supervisor: "bg-brand-50 border-brand-100 text-brand-700",
  Employee: "bg-brand-50/60 border-border-strong text-ink-secondary",
};

const SCHEDULE = "Full-time · Sun–Thu · 7:00 AM–4:00 PM";

function makeEmployee(
  input: {
    name: string;
    department: Department;
    weeklyHours: number;
    skills: string;
    knowledgeAreas: string;
  },
  employees: Employee[]
): Employee {
  const idSlug = input.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const skills = input.skills
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, level: "Intermediate" as const }));
  const knowledgeAreas = input.knowledgeAreas
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const supervisor = getDepartmentSupervisor(input.department, employees);

  return {
    id: `${idSlug}-${Date.now().toString(36)}`,
    name: input.name,
    department: input.department,
    level: "Employee",
    supervisorId: supervisor?.id ?? null,
    employeeIdNumber: `EMP-${Math.floor(10000 + Math.random() * 89999)}`,
    skills,
    knowledgeAreas,
    workingSchedule: SCHEDULE,
    weeklyHours: input.weeklyHours,
    workload: { project: 0, operational: 0, adhoc: 0, other: 0 },
    currentUtilization: 0,
    futureCapacity: 0,
    forecast8Week: [0, 0, 0, 0, 0, 0, 0, 0],
    upcomingTickets: [],
    adhoc: [],
    leaveEvents: [],
  };
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function exportEmployeesCsv(rowEmployees: Employee[], allEmployees: Employee[]) {
  const header = ["Employee ID", "Employee", "Level", "Department", "Supervisor", "Skills", "Working Hours", "Availability"];
  const rows = rowEmployees.map((e) => [
    e.employeeIdNumber,
    e.name,
    e.level,
    e.department,
    getSupervisorName(e, allEmployees),
    e.skills.map((s) => `${s.name} (${s.level})`).join("; "),
    `${e.weeklyHours}h/week`,
    getAvailabilityStatus(e),
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "worklens-hr-employees.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface LeaveRow {
  key: string;
  employeeId: string;
  employeeName: string;
  type: string;
  start: string;
  end: string;
  status: "Approved" | "Pending";
}

function exportLeavesCsv(rows: LeaveRow[]) {
  const header = ["Employee", "Leave Type", "Start Date", "End Date", "Status"];
  const csvRows = rows.map((r) => [r.employeeName, r.type, r.start, r.end, r.status]);
  const csv = [header, ...csvRows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "worklens-hr-leaves.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function HrSystemPage() {
  const system = getSourceSystem("hr");
  const { employees, addEmployee, removeEmployee } = useEmployees();
  const { requests } = useHandoverRequests();
  const [tab, setTab] = useState<"employees" | "leaves">("leaves");
  const [showAddForm, setShowAddForm] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      employees
        .filter((e) => (IT_DEPARTMENTS as readonly string[]).includes(e.department))
        // Supervisor(s) first, then everyone else alphabetically (unchanged).
        .sort(
          (a, b) =>
            (a.level === "Supervisor" ? 0 : 1) - (b.level === "Supervisor" ? 0 : 1) ||
            a.name.localeCompare(b.name)
        ),
    [employees]
  );

  const leaveRows = useMemo<LeaveRow[]>(() => {
    const approved: LeaveRow[] = sorted.flatMap((e) =>
      e.leaveEvents.map((l) => ({
        key: `${e.id}-${l.id}`,
        employeeId: e.id,
        employeeName: e.name,
        type: l.type,
        start: l.start,
        end: l.end,
        status: (l.status ?? "Approved") as "Approved" | "Pending",
      }))
    );
    const pending: LeaveRow[] = requests
      .filter((r) => r.status === "Pending Supervisor Review" && sorted.some((e) => e.id === r.employeeId))
      .map((r) => ({
        key: r.id,
        employeeId: r.employeeId,
        employeeName: sorted.find((e) => e.id === r.employeeId)?.name ?? r.employeeId,
        type: r.leaveType ?? "Leave",
        start: r.startDate,
        end: r.endDate,
        status: "Pending" as const,
      }));
    return [...approved, ...pending].sort((a, b) => a.start.localeCompare(b.start));
  }, [sorted, requests]);

  return (
    <SystemPageShell>
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to Enterprise Systems
      </Link>

      <SourceSystemHeader
        system={{ ...system, name: "HR System", subtitle: "Employee Master Data" }}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (tab === "employees") {
                  exportEmployeesCsv(sorted, employees);
                  setExportNotice(`Exported ${sorted.length} employees to worklens-hr-employees.csv.`);
                } else {
                  exportLeavesCsv(leaveRows);
                  setExportNotice(`Exported ${leaveRows.length} leave records to worklens-hr-leaves.csv.`);
                }
                window.setTimeout(() => setExportNotice(null), 3500);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-brand-50"
            >
              <Download className="h-4 w-4" strokeWidth={1.75} />
              Export
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Add Employee
            </button>
          </div>
        }
      />

      <div className="flex items-center gap-1 rounded-lg border border-border-strong bg-surface p-1 w-fit">
        <button
          onClick={() => setTab("leaves")}
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === "leaves" ? "bg-brand-800 text-white" : "text-ink-secondary hover:bg-brand-50"
          }`}
        >
          Employee Calendar
        </button>
        <button
          onClick={() => setTab("employees")}
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === "employees" ? "bg-brand-800 text-white" : "text-ink-secondary hover:bg-brand-50"
          }`}
        >
          Employee Information
        </button>
      </div>

      {exportNotice && (
        <div className="rounded-lg border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-4 py-3 text-sm text-[var(--status-good)]">
          {exportNotice}
        </div>
      )}

      {tab === "employees" && (
        <>
          <p className="text-sm text-ink-secondary">Central employee information used by WorkLens.</p>

          <Card>
            <CardHeader
              title="Employees"
              subtitle={`Showing ${sorted.length} employees synced from HR · IT Service Support & Cybersecurity (demo dataset)`}
            />
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-brand-50/60 text-left text-xs font-medium uppercase tracking-wide text-ink-secondary">
                    <th className="px-4 py-3">Employee ID</th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Level</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Supervisor</th>
                    <th className="px-4 py-3">Skills</th>
                    <th className="px-4 py-3">Working Hours</th>
                    <th className="px-4 py-3">Availability</th>
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e) => {
                    const availability = getAvailabilityStatus(e);
                    const isSupervisor = e.level === "Supervisor";
                    return (
                      <ClickableRow key={e.id} href={`/systems/hr/${e.id}`}>
                        <td className="px-4 py-3 tabular text-ink-secondary whitespace-nowrap">{e.employeeIdNumber}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                            {isSupervisor && (
                              <Crown className="h-3.5 w-3.5 shrink-0 text-brand-700" aria-hidden strokeWidth={2.25} />
                            )}
                            <span className="font-medium text-ink whitespace-nowrap group-hover:text-brand-700 group-hover:underline underline-offset-2">
                              {e.name}
                            </span>
                            {isSupervisor && (
                              <span className="rounded-full border border-brand-100 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                                Supervisor
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${LEVEL_STYLES[e.level]}`}>
                            {e.level}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-ink-secondary whitespace-nowrap">{e.department}</td>
                        <td className="px-4 py-3 text-ink-secondary whitespace-nowrap">{getSupervisorName(e, employees)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {e.skills.slice(0, 3).map((s) => (
                              <span key={s.name} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-800 whitespace-nowrap">
                                {s.name}
                              </span>
                            ))}
                            {e.skills.length > 3 && (
                              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-ink-muted">+{e.skills.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular text-ink-secondary whitespace-nowrap">{e.weeklyHours}h/week</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${AVAILABILITY_STYLES[availability]}`}>
                            {availability}
                          </span>
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setDeleteError(null);
                                setDeleteTarget(e);
                              }}
                              aria-label={`Delete ${e.name}`}
                              className="rounded-md p-1.5 text-ink-muted hover:bg-[var(--status-critical-bg)] hover:text-[var(--status-critical)]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <ChevronRight className="h-4 w-4 text-ink-muted" />
                          </div>
                        </td>
                      </ClickableRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <SourceSystemNotice>
            Prototype assumption: HR provides an approved employee master dataset containing the fields required for
            capacity planning.
          </SourceSystemNotice>
        </>
      )}

      {tab === "leaves" && (
        <>
          <p className="text-sm text-ink-secondary">
            Who is on leave and when, across IT Service Support &amp; Cybersecurity. Pending requests are awaiting the
            employee&rsquo;s supervisor to approve — once approved, declined, or rescheduled, this calendar updates
            automatically. Showing {leaveRows.length} leave record{leaveRows.length === 1 ? "" : "s"}.
          </p>

          <EmployeeLeaveCalendar leaves={leaveRows} employees={sorted} />
        </>
      )}

      {showAddForm && (
        <AddEmployeeModal
          employees={employees}
          error={addError}
          onClose={() => {
            setAddError(null);
            setShowAddForm(false);
          }}
          onSubmit={async (input) => {
            setAddError(null);
            try {
              await addEmployee(makeEmployee(input, employees));
              setShowAddForm(false);
            } catch {
              setAddError("Couldn't save this employee — check your connection and try again.");
            }
          }}
        />
      )}

      {deleteTarget && (
        <DeleteEmployeeModal
          employee={deleteTarget}
          employees={employees}
          error={deleteError}
          onClose={() => {
            setDeleteError(null);
            setDeleteTarget(null);
          }}
          onConfirm={async () => {
            setDeleteError(null);
            try {
              await removeEmployee(deleteTarget.id);
              setDeleteTarget(null);
            } catch (err) {
              setDeleteError(
                err instanceof Error && err.message.includes("schema.sql")
                  ? err.message
                  : "Couldn't delete this employee — check your connection and try again."
              );
            }
          }}
        />
      )}
    </SystemPageShell>
  );
}

function AddEmployeeModal({
  employees,
  error,
  onClose,
  onSubmit,
}: {
  employees: Employee[];
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { name: string; department: Department; weeklyHours: number; skills: string; knowledgeAreas: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [department, setDepartment] = useState<Department>(IT_DEPARTMENTS[0]);
  const [weeklyHours, setWeeklyHours] = useState(40);
  const [skills, setSkills] = useState("");
  const [knowledgeAreas, setKnowledgeAreas] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const supervisor = getDepartmentSupervisor(department, employees);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">Add Employee</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-3.5 py-2.5 text-xs text-[var(--status-critical)]">
            {error}
          </p>
        )}

        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || submitting) return;
            setSubmitting(true);
            await onSubmit({ name: name.trim(), department, weeklyHours, skills, knowledgeAreas });
            setSubmitting(false);
          }}
        >
          <Field label="Full Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" required />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Department">
              <select value={department} onChange={(e) => setDepartment(e.target.value as Department)} className="input">
                {IT_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-ink-muted">
                {supervisor ? (
                  <>
                    Reports to <span className="font-medium text-ink-secondary">{supervisor.name}</span>
                  </>
                ) : (
                  "No supervisor on record for this department yet."
                )}
              </p>
            </Field>
            <Field label="Working Hours / Week">
              <input
                type="number"
                min={1}
                max={60}
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(Number(e.target.value) || 40)}
                className="input"
              />
            </Field>
          </div>
          <Field label="Skills (comma-separated)">
            <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="SQL, Python, Power BI" className="input" />
          </Field>
          <Field label="Knowledge Areas (comma-separated)">
            <input
              value={knowledgeAreas}
              onChange={(e) => setKnowledgeAreas(e.target.value)}
              placeholder="Reporting, Data Visualization"
              className="input"
            />
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-brand-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {submitting ? "Adding…" : "Add Employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}
