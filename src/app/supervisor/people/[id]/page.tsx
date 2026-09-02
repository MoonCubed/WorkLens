"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, Repeat2, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SkillLevelBar } from "@/components/ui/ProgressBar";
import { SkillSelect } from "@/components/skills/SkillSelect";
import { AssignedTaskStatusChart } from "@/components/charts/AssignedTaskStatusChart";
import { WeeklyCapacityChart } from "@/components/charts/WeeklyCapacityChart";
import { WorkItemRow, type WorkRow } from "@/components/work/WorkItemRow";
import type { SkillLevel } from "@/data/types";
import { useEmployees } from "@/store/employees-store";
import { useSupervisorSession } from "@/store/session-store";
import { useWorkLog } from "@/store/work-log-store";
import { getDepartmentSupervisor } from "@/lib/hr";
import { computeEmployeeCapacity, computeEmployeeWeeklyCapacity, ticketEffortForEmployee } from "@/lib/capacityEngine";
import { ticketDueLabel, seedTicketDueLabel, adhocDueLabel } from "@/lib/due";
import type { TicketStatus } from "@/data/tickets";
import { useTickets } from "@/store/tickets-store";
import { useSkillChangeRequests } from "@/store/skill-change-requests-store";
import type { HoldDates } from "@/components/work/StatusChangeDialog";

const SKILL_LEVELS: SkillLevel[] = ["Beginner", "Intermediate", "Advanced", "Expert"];

export default function EmployeeDetailsPage() {
  const params = useParams<{ id: string }>();
  const { employees, updateEmployee } = useEmployees();
  const employee = employees.find((e) => e.id === params.id);
  const { tickets, updateTicketStatus } = useTickets();
  const { getEntry } = useWorkLog();
  const { requests: skillChangeRequests } = useSkillChangeRequests();
  const pendingSkillChanges = skillChangeRequests.filter((r) => r.employeeId === params.id && r.status === "Pending");
  const { unit } = useSupervisorSession();
  const currentUserName = getDepartmentSupervisor(unit, employees)?.name ?? "Supervisor";
  const [skillDraft, setSkillDraft] = useState("");
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("Beginner");
  const [skillError, setSkillError] = useState<string | null>(null);

  async function addSkill() {
    if (!employee) return;
    const name = skillDraft.trim();
    if (!name || employee.skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setSkillDraft("");
      return;
    }
    setSkillError(null);
    try {
      await updateEmployee(employee.id, { skills: [...employee.skills, { name, level: skillLevel }] });
      setSkillDraft("");
    } catch {
      setSkillError("Couldn't save this skill — check your connection and try again.");
    }
  }

  async function removeSkill(name: string) {
    if (!employee) return;
    setSkillError(null);
    try {
      await updateEmployee(employee.id, { skills: employee.skills.filter((s) => s.name !== name) });
    } catch {
      setSkillError("Couldn't remove this skill — check your connection and try again.");
    }
  }

  if (!employee) {
    return (
      <div className="max-w-6xl space-y-4">
        <Link href="/supervisor/team-capacity" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
          <ArrowLeft className="h-4 w-4" />
          Back to Team Capacity
        </Link>
        <p className="text-sm text-ink-muted">Employee not found.</p>
      </div>
    );
  }

  const assignedTickets = tickets.filter((t) => (t.assignedEmployeeIds ?? []).includes(employee.id));
  const activeAssignedTickets = assignedTickets.filter((t) => t.status !== "Completed");
  const completedAssignedTickets = assignedTickets.filter((t) => t.status === "Completed");

  const ticketRows: WorkRow[] = [
    ...employee.upcomingTickets.map((t) => ({
      key: `${employee.id}:${t.id}`,
      title: t.title,
      type: "Ticket" as const,
      priority: t.priority,
      deadline: seedTicketDueLabel(t),
      estimatedHours: t.estimatedHours,
    })),
    ...activeAssignedTickets.map((t) => ({
      key: `${employee.id}:${t.id}`,
      title: (t.assignedEmployeeIds ?? []).length > 1 ? `${t.title} (${t.id}) — shared` : `${t.title} (${t.id})`,
      type: "Ticket" as const,
      priority: t.priority,
      deadline: ticketDueLabel(t),
      estimatedHours: ticketEffortForEmployee(t, employee.id),
      ticketId: t.id,
      ticketStatus: t.status,
      ticketResolvedDate: t.resolvedDate,
      ticketHoldStart: t.holdStartDate ?? null,
      ticketHoldEnd: t.holdEndDate ?? null,
    })),
  ];
  // The supervisor can move a ticket's lifecycle status from this page too — same
  // shared field the employee and IT-Demand edit.
  const updateTicketStatusSafe = (id: string, status: TicketStatus, hold?: HoldDates) =>
    updateTicketStatus(id, status, hold).catch(() =>
      setSkillError("Couldn't update the task status — check your connection and try again.")
    );
  const adhocRows: WorkRow[] = employee.adhoc.map((a) => ({
    key: `${employee.id}:${a.id}`,
    title: a.name,
    type: "Ad-hoc",
    priority: a.priority,
    deadline: adhocDueLabel(a),
    estimatedHours: a.estimatedHours,
  }));
  // The employee's actual current workload — live remaining hours across assigned
  // work, and the leave-adjusted available hours for the week (same formula as
  // every other capacity figure in the app).
  const capacity = computeEmployeeCapacity(employee, tickets, getEntry);
  // Week-by-week capacity — the supervisor's primary capacity view for this person.
  const weeklyCapacity = computeEmployeeWeeklyCapacity(employee, tickets, getEntry, 8);
  const initials = employee.name.split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <div className="max-w-6xl space-y-6">
      <Link href="/supervisor/team-capacity" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to Team Capacity
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 shrink-0 rounded-full bg-brand-800 text-white text-lg font-semibold flex items-center justify-center">
            {initials}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-ink tracking-tight">{employee.name}</h1>
            <p className="text-sm text-ink-secondary">{employee.department}</p>
            <p className="text-xs text-ink-muted mt-0.5">
              {employee.employeeIdNumber} · {employee.workingSchedule}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {capacity.onLeave ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2.5 py-1 text-xs font-medium text-[var(--status-warning)]">
              <Repeat2 className="h-3 w-3" />
              On Leave
            </span>
          ) : (
            <StatusBadge utilization={capacity.utilization} />
          )}
          <Link
            href={`/supervisor/handover?employee=${employee.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-brand-50"
          >
            <Repeat2 className="h-4 w-4" />
            Simulate Absence
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-secondary">This Week&rsquo;s Workload</p>
          <p className="mt-1.5 text-2xl font-semibold text-ink tabular">
            {capacity.activeHours}h{" "}
            <span className="text-base font-normal text-ink-muted">/ {capacity.workingHours}h this week</span>
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Deadline-driven effort due this week · {capacity.totalRemainingHours}h remaining in total
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-secondary">Current Capacity</p>
          <p className="mt-1.5 text-2xl font-semibold text-ink tabular">{capacity.utilization}%</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-secondary">Available Capacity</p>
          <p className="mt-1.5 text-2xl font-semibold text-ink tabular">
            {capacity.availablePercent}%{" "}
            <span className="text-base font-normal text-ink-muted">· {capacity.availableHours}h</span>
          </p>
          {capacity.onLeave && <p className="mt-1 text-xs text-[var(--status-warning)]">Currently on leave — unavailable for assignment</p>}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Skills" subtitle="Editable — changes reflect in the HR System too" />
          {pendingSkillChanges.length > 0 && (
            <Link
              href="/supervisor/skills"
              className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-xs font-medium text-[var(--status-warning)] hover:brightness-[0.98]"
            >
              {pendingSkillChanges.length} skill change{pendingSkillChanges.length === 1 ? "" : "s"} from {employee.name.split(" ")[0]} awaiting review
              <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
            </Link>
          )}
          <div className="space-y-3.5">
            {employee.skills.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-4">
                <span className="text-sm text-ink w-32 shrink-0">{s.name}</span>
                <div className="flex flex-1 items-center gap-3">
                  <SkillLevelBar level={s.level} />
                </div>
                <button
                  onClick={() => removeSkill(s.name)}
                  className="shrink-0 text-ink-muted hover:text-ink"
                  aria-label={`Remove ${s.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {employee.skills.length === 0 && <p className="text-sm text-ink-muted">No skills on record.</p>}
          </div>

          <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[220px]">
              <SkillSelect
                value={skillDraft}
                onChange={setSkillDraft}
                exclude={employee.skills.map((s) => s.name)}
                aria-label="Skill"
              />
            </div>
            <select value={skillLevel} onChange={(e) => setSkillLevel(e.target.value as SkillLevel)} className="input max-w-[140px]">
              {SKILL_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button
              onClick={addSkill}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add Skill
            </button>
          </div>
          {skillError && <p className="mt-2 text-xs font-medium text-[var(--status-critical)]">{skillError}</p>}
        </Card>

        <Card>
          <CardHeader
            title="Task Status"
            subtitle={(() => {
              const active = assignedTickets.filter((t) => t.status !== "Completed").length;
              return `${active} active task${active === 1 ? "" : "s"} · In Progress, On Hold, Overdue`;
            })()}
          />
          <AssignedTaskStatusChart tickets={assignedTickets} />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Weekly Capacity"
          subtitle="Planned capacity week by week, from task deadlines and estimated effort. Use ← → to move between weeks."
        />
        <WeeklyCapacityChart points={weeklyCapacity} />
      </Card>

      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Current Work</h2>
        <p className="mb-3 text-xs text-ink-muted">Click a task to view details, update its status, and add notes.</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Tickets" />
            {ticketRows.length === 0 ? (
              <EmptyState label="No open tickets." />
            ) : (
              <div className="space-y-3">
                {ticketRows.map((row) => (
                  <WorkItemRow
                    key={row.key}
                    row={row}
                    currentUserName={currentUserName}
                    onUpdateTicketStatus={updateTicketStatusSafe}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Ad-hoc Activities" />
            {adhocRows.length === 0 ? (
              <EmptyState label="No ad-hoc activities." />
            ) : (
              <div className="space-y-3">
                {adhocRows.map((row) => (
                  <WorkItemRow key={row.key} row={row} currentUserName={currentUserName} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {completedAssignedTickets.length > 0 && (
        <Card>
          <CardHeader
            title="Completed Tasks"
            subtitle={`${completedAssignedTickets.length} task${completedAssignedTickets.length === 1 ? "" : "s"} ${employee.name.split(" ")[0]} has finished — no longer active work`}
          />
          <ul className="divide-y divide-border">
            {completedAssignedTickets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {t.title} <span className="text-xs font-normal text-ink-muted">({t.id})</span>
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {t.priority} priority · {t.assignedUnit}
                    {t.resolvedDate ? ` · completed ${t.resolvedDate}` : ""}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--status-good)]">
                  Completed
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Leave / Availability" />
        {employee.leaveEvents.length === 0 ? (
          <EmptyState label="No upcoming leave scheduled." />
        ) : (
          <ul className="space-y-3">
            {employee.leaveEvents.map((l) => (
              <li key={l.id} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-ink">{l.type}</p>
                <p className="mt-1 text-xs text-ink-secondary">
                  {l.start} – {l.end}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-ink-muted py-4">{label}</p>;
}
