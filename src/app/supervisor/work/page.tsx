"use client";

import { useMemo, useState } from "react";
import { Crown, X, Award, CalendarClock, Clock, AlertTriangle, CheckCircle2, Inbox } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { PriorityBadge } from "@/components/ui/StatusBadge";
import { CapacityBar } from "@/components/ui/ProgressBar";
import { AiTag } from "@/components/ui/AiTag";
import { TaskDetailPanel } from "@/components/work/TaskDetailPanel";
import type { AssignedTicket } from "@/store/tickets-store";
import { useTickets, ticketsForUnit } from "@/store/tickets-store";
import { useSupervisorSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";
import { useWorkLog } from "@/store/work-log-store";
import { useTaskAdjustments } from "@/store/task-adjustments-store";
import { getDepartmentSupervisor, getUnitTeam } from "@/lib/hr";
import { projectedUtilization } from "@/lib/capacityEngine";
import { completionSortKey } from "@/lib/dashboardSummary";
import { slaWindowLabel } from "@/lib/date";
import { ticketDueLabel } from "@/lib/due";
import { rankCandidatesForTicket, type TicketCandidate } from "@/lib/ticketMatch";
import { OVERLOAD_THRESHOLD } from "@/data/config";
import type { Employee } from "@/data/types";

// Assigning work that would take someone past the overload threshold pauses for a
// confirmation showing the resulting percentage.
const CAPACITY_WARN_THRESHOLD = OVERLOAD_THRESHOLD;
const INITIAL_ROWS = 5;

export default function SupervisorWorkPage() {
  const { unit } = useSupervisorSession();
  const {
    tickets,
    assignTicketToEmployee,
    setTicketAssignees,
    setTicketEffortSplit,
    updateTicketStatus,
    updateTicketPriority,
    updateTicketSkills,
    updateTicketDeadline,
    updateTicketEstimate,
  } = useTickets();
  const { employees } = useEmployees();
  const { getEntry } = useWorkLog();
  const { requests: adjustmentRequests, resolve: resolveAdjustment } = useTaskAdjustments();

  const [openCandidates, setOpenCandidates] = useState<AssignedTicket | null>(null);
  const [openDetail, setOpenDetail] = useState<AssignedTicket | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [pendingAssign, setPendingAssign] = useState<{ ticket: AssignedTicket; employee: Employee; projected: number } | null>(null);
  const [showAllAssigned, setShowAllAssigned] = useState(false);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [dismissedCompletion, setDismissedCompletion] = useState<string | null>(null);

  const currentUserName = getDepartmentSupervisor(unit, employees)?.name ?? "Supervisor";
  const unitEmployees = useMemo(() => getUnitTeam(unit, employees), [unit, employees]);
  const unitTickets = useMemo(() => ticketsForUnit(tickets, unit), [tickets, unit]);

  const queue = unitTickets.filter((t) => (t.assignedEmployeeIds ?? []).length === 0 && t.status !== "Completed");
  const assigned = unitTickets
    .filter((t) => (t.assignedEmployeeIds ?? []).length > 0 && t.status !== "Completed")
    .sort((a, b) => completionSortKey(b) - completionSortKey(a));
  const completed = unitTickets
    .filter((t) => t.status === "Completed")
    .sort((a, b) => completionSortKey(b) - completionSortKey(a));

  const pendingAdjustments = adjustmentRequests.filter(
    (r) => r.status === "Pending Review" && unitTickets.some((t) => t.id === r.ticketId)
  );

  // Suggested candidates for every unit ticket — so both "Assign" and "Reassign"
  // open the same picker.
  const candidatesByTicket = useMemo(() => {
    const map = new Map<string, TicketCandidate[]>();
    unitTickets.forEach((t) => map.set(t.id, rankCandidatesForTicket(unitEmployees, t, unitEmployees.length)));
    return map;
  }, [unitTickets, unitEmployees]);

  const detailTicket = openDetail ? unitTickets.find((t) => t.id === openDetail.id) ?? openDetail : null;
  const candidateTicket = openCandidates ? unitTickets.find((t) => t.id === openCandidates.id) ?? openCandidates : null;

  // Only surface a completion that actually happened in-app (has an activity
  // timestamp) — not a pre-seeded historical one.
  const latestCompletion = completed.find((t) => t.activityAt);
  const completionNotice =
    latestCompletion && latestCompletion.id !== dismissedCompletion ? latestCompletion : null;
  const nameFor = (id: string) => employees.find((e) => e.id === id)?.name ?? id;

  async function commitAssign(ticketId: string, employeeId: string) {
    setAssignError(null);
    try {
      await assignTicketToEmployee(ticketId, employeeId);
      setOpenCandidates(null);
      setPendingAssign(null);
    } catch {
      setAssignError("Couldn't assign this ticket — check your connection and try again.");
    }
  }

  /** Assign, but first work out the employee's resulting capacity. Over the warning
   * threshold, pause for a confirmation showing the actual resulting percentage. */
  function requestAssign(ticketId: string, employeeId: string) {
    if (!employeeId) return;
    const ticket = tickets.find((t) => t.id === ticketId);
    const employee = unitEmployees.find((e) => e.id === employeeId);
    if (!ticket || !employee) return;
    const alreadyOwns = (ticket.assignedEmployeeIds ?? []).includes(employeeId);
    const extra = alreadyOwns ? 0 : ticket.estimatedHours;
    const projected = projectedUtilization(employee, tickets, getEntry, extra);
    if (projected > CAPACITY_WARN_THRESHOLD && !alreadyOwns) {
      setPendingAssign({ ticket, employee, projected });
      return;
    }
    commitAssign(ticketId, employeeId);
  }

  async function approveAdjustment(reqId: string) {
    setAssignError(null);
    const req = adjustmentRequests.find((r) => r.id === reqId);
    if (!req) return;
    try {
      if (req.kind === "deadline" && req.requestedDeadline) {
        await updateTicketDeadline(req.ticketId, req.requestedDeadline);
      } else if (req.kind === "effort" && typeof req.requestedHours === "number") {
        await updateTicketEstimate(req.ticketId, req.requestedHours);
      }
      await resolveAdjustment(reqId, "Approved");
    } catch {
      setAssignError("Couldn't apply this adjustment — check your connection and try again.");
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Tasks</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Incoming work for {unit}. Tickets arrive from IT-Demand assigned to your unit only — decide who
          on your team should handle each one.
        </p>
      </div>

      {assignError && (
        <p className="rounded-lg border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical)]">
          {assignError}
        </p>
      )}

      {completionNotice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-4 py-3 text-sm text-[var(--status-good)]">
          <span className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">{completionNotice.title}</span> was marked complete
              {(completionNotice.assignedEmployeeIds ?? []).length > 0 &&
                ` by ${(completionNotice.assignedEmployeeIds ?? []).map(nameFor).join(" & ")}`}
              {completionNotice.resolvedDate ? ` · ${completionNotice.resolvedDate}` : ""}.
            </span>
          </span>
          <button
            onClick={() => setDismissedCompletion(completionNotice.id)}
            className="shrink-0 text-[var(--status-good)] hover:opacity-70"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {pendingAdjustments.length > 0 && (
        <Card>
          <CardHeader
            title="Adjustment Requests"
            subtitle="Raised by employees from their task details"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2.5 py-1 text-xs font-medium text-[var(--status-warning)]">
                <Inbox className="h-3.5 w-3.5" />
                {pendingAdjustments.length} pending
              </span>
            }
          />
          <ul className="divide-y divide-border">
            {pendingAdjustments.map((r) => {
              const t = unitTickets.find((x) => x.id === r.ticketId);
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {t?.title ?? r.ticketId} <span className="text-xs font-normal text-ink-muted">({r.ticketId})</span>
                    </p>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      {nameFor(r.employeeId)} ·{" "}
                      {r.kind === "deadline"
                        ? `Extend deadline${t ? ` from ${ticketDueLabel(t)}` : ""} to ${r.requestedDeadline}`
                        : r.kind === "effort"
                          ? `Change estimated effort${t ? ` from ${t.estimatedHours}h` : ""} to ${r.requestedHours}h`
                          : r.kind === "reassignment"
                            ? "Requests a change to the assignment"
                            : "Other adjustment"}
                    </p>
                    {r.justification && <p className="text-xs text-ink-secondary mt-1 italic">&ldquo;{r.justification}&rdquo;</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(r.kind === "reassignment" || r.kind === "other") && t && (
                      <button
                        onClick={() => setOpenCandidates(t)}
                        className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-brand-50"
                      >
                        Review candidates
                      </button>
                    )}
                    <button
                      onClick={() => resolveAdjustment(r.id, "Dismissed")}
                      className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-brand-50"
                    >
                      Dismiss
                    </button>
                    {(r.kind === "deadline" || r.kind === "effort") && (
                      <button
                        onClick={() => approveAdjustment(r.id)}
                        className="rounded-lg bg-brand-800 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                      >
                        Approve
                      </button>
                    )}
                    {(r.kind === "reassignment" || r.kind === "other") && (
                      <button
                        onClick={() => resolveAdjustment(r.id, "Approved")}
                        className="rounded-lg bg-brand-800 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Unassigned Tickets"
          subtitle={`${queue.length} ticket${queue.length === 1 ? "" : "s"} waiting for an owner · click a ticket for details, or Assign to see suggested candidates`}
        />
        {queue.length === 0 ? (
          <p className="text-sm text-ink-muted py-4">No unassigned tickets for {unit} right now.</p>
        ) : (
          <ul className="divide-y divide-border">
            {queue.map((t) => {
              const top = (candidatesByTicket.get(t.id) ?? [])[0];
              return (
                <li
                  key={t.id}
                  onClick={() => setOpenDetail(t)}
                  onKeyDown={(e) => e.key === "Enter" && setOpenDetail(t)}
                  tabIndex={0}
                  role="button"
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5 cursor-pointer rounded-lg px-2 -mx-2 hover:bg-brand-50/40 focus:bg-brand-50/40 outline-none transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {t.title} <span className="text-xs font-normal text-ink-muted">({t.id})</span>
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Raised {t.raisedDate} · {t.estimatedHours}h estimated · Due {ticketDueLabel(t)} · SLA {slaWindowLabel(t.priority)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <PriorityBadge priority={t.priority} />
                    {top && (
                      <span
                        className="hidden sm:inline-flex items-center gap-1 rounded-full border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-2 py-1 text-[11px] font-medium text-[var(--status-good)]"
                        title={`Top suggestion: ${top.employee.name}`}
                      >
                        <Crown className="h-3 w-3" />
                        {top.employee.name.split(" ")[0]}
                      </span>
                    )}
                    <button
                      onClick={() => setOpenCandidates(t)}
                      className="rounded-lg bg-brand-800 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      Assign
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Recently Assigned"
          subtitle="Tickets routed to a team member, newest first · click a ticket for details, or Reassign to pick someone else"
        />
        {assigned.length === 0 ? (
          <p className="text-sm text-ink-muted py-4">Nothing assigned yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {(showAllAssigned ? assigned : assigned.slice(0, INITIAL_ROWS)).map((t) => {
                const assigneeIds = t.assignedEmployeeIds ?? [];
                const coAssigneeCount = assigneeIds.length - 1;
                return (
                  <li
                    key={t.id}
                    onClick={() => setOpenDetail(t)}
                    onKeyDown={(e) => e.key === "Enter" && setOpenDetail(t)}
                    tabIndex={0}
                    role="button"
                    className="flex flex-wrap items-center justify-between gap-3 py-3.5 cursor-pointer rounded-lg px-2 -mx-2 hover:bg-brand-50/40 focus:bg-brand-50/40 outline-none transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {t.title} <span className="text-xs font-normal text-ink-muted">({t.id})</span>
                      </p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {assigneeIds.map((id) => nameFor(id)).join(" & ")} · {t.status} · Due {ticketDueLabel(t)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <PriorityBadge priority={t.priority} />
                      {coAssigneeCount > 0 && (
                        <span className="rounded-full border border-brand-100 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                          shared
                        </span>
                      )}
                      <button
                        onClick={() => setOpenCandidates(t)}
                        className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-brand-50"
                      >
                        Reassign
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {assigned.length > INITIAL_ROWS && (
              <button
                onClick={() => setShowAllAssigned((v) => !v)}
                className="mt-3 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-brand-50"
              >
                {showAllAssigned ? "Show less" : `View all ${assigned.length}`}
              </button>
            )}
          </>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Completed"
          subtitle="Tasks a team member has marked complete, newest first"
          action={
            completed.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-2.5 py-1 text-xs font-medium text-[var(--status-good)]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {completed.length}
              </span>
            ) : undefined
          }
        />
        {completed.length === 0 ? (
          <p className="text-sm text-ink-muted py-4">No completed tasks yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {(showAllCompleted ? completed : completed.slice(0, INITIAL_ROWS)).map((t) => (
                <li
                  key={t.id}
                  onClick={() => setOpenDetail(t)}
                  onKeyDown={(e) => e.key === "Enter" && setOpenDetail(t)}
                  tabIndex={0}
                  role="button"
                  className="flex flex-wrap items-center justify-between gap-3 py-3.5 cursor-pointer rounded-lg px-2 -mx-2 hover:bg-brand-50/40 focus:bg-brand-50/40 outline-none transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {t.title} <span className="text-xs font-normal text-ink-muted">({t.id})</span>
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {(t.assignedEmployeeIds ?? []).map((id) => nameFor(id)).join(" & ") || "Unassigned"}
                      {t.resolvedDate ? ` · completed ${t.resolvedDate}` : ""}
                    </p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--status-good)]" />
                </li>
              ))}
            </ul>
            {completed.length > INITIAL_ROWS && (
              <button
                onClick={() => setShowAllCompleted((v) => !v)}
                className="mt-3 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-brand-50"
              >
                {showAllCompleted ? "Show less" : `View all ${completed.length}`}
              </button>
            )}
          </>
        )}
      </Card>

      {candidateTicket && (
        <CandidatesModal
          ticket={candidateTicket}
          candidates={candidatesByTicket.get(candidateTicket.id) ?? []}
          onAssign={(employeeId) => requestAssign(candidateTicket.id, employeeId)}
          onClose={() => setOpenCandidates(null)}
        />
      )}

      {detailTicket && (
        <TaskDetailPanel
          key={detailTicket.id}
          ticket={detailTicket}
          employees={unitEmployees}
          currentUserName={currentUserName}
          assigneeEditing={false}
          onClose={() => setOpenDetail(null)}
          onUpdateStatus={(status, hold) => updateTicketStatus(detailTicket.id, status, hold).catch(() => setAssignError("Couldn't update status — check your connection and try again."))}
          onUpdatePriority={(priority) => updateTicketPriority(detailTicket.id, priority).catch(() => setAssignError("Couldn't update priority — check your connection and try again."))}
          onUpdateSkills={(skills) => updateTicketSkills(detailTicket.id, skills).catch(() => setAssignError("Couldn't update skills — check your connection and try again."))}
          onUpdateAssignees={(ids, split) => setTicketAssignees(detailTicket.id, ids, split).catch(() => setAssignError("Couldn't update assignees — check your connection and try again."))}
          onUpdateEffortSplit={(split) => setTicketEffortSplit(detailTicket.id, split).catch(() => setAssignError("Couldn't update the effort split — check your connection and try again."))}
        />
      )}

      {pendingAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-8" onClick={() => setPendingAssign(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-warning)]" strokeWidth={2} />
              <div>
                <h2 className="text-base font-semibold text-ink">Check capacity before assigning</h2>
                <p className="mt-1.5 text-sm text-ink-secondary">
                  Warning: this assignment will increase{" "}
                  <span className="font-semibold text-ink">{pendingAssign.employee.name}</span>&rsquo;s capacity to{" "}
                  <span className="font-semibold text-ink">{pendingAssign.projected}%</span>.
                </p>
                <p className="mt-2 text-xs text-ink-muted">You can still go ahead — this is a heads-up, not a block.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setPendingAssign(null)}
                className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-brand-50"
              >
                Cancel
              </button>
              <button
                onClick={() => commitAssign(pendingAssign.ticket.id, pendingAssign.employee.id)}
                className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Assign anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CandidatesModal({
  ticket,
  candidates,
  onAssign,
  onClose,
}: {
  ticket: AssignedTicket;
  candidates: TicketCandidate[];
  onAssign: (employeeId: string) => void;
  onClose: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const assigneeIds = ticket.assignedEmployeeIds ?? [];
  const visible = showAll ? candidates : candidates.slice(0, 3);
  const remaining = candidates.length - visible.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-8" onClick={onClose}>
      <div
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{ticket.id}</p>
            <h2 className="mt-0.5 text-lg font-semibold text-ink">{ticket.title}</h2>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-4">
          <PriorityBadge priority={ticket.priority} />
        </div>

        <p className="text-sm text-ink-secondary leading-relaxed">{ticket.description}</p>

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-brand-50/40 p-3.5 text-xs sm:grid-cols-4">
          <Detail label="Raised" value={ticket.raisedDate} />
          <Detail label="Estimated" value={`${ticket.estimatedHours}h`} />
          <Detail label="SLA" value={slaWindowLabel(ticket.priority)} />
          <Detail label="Due" value={ticketDueLabel(ticket)} />
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink">Suggested Candidates</h3>
            <AiTag label="AI-assisted recommendation" />
          </div>

          {candidates.length === 0 ? (
            <p className="text-sm text-ink-muted py-4">No employees available in this unit to suggest.</p>
          ) : (
            <>
              <div className="space-y-3">
                {visible.map((c, idx) => (
                  <CandidateCard
                    key={c.employee.id}
                    candidate={c}
                    best={idx === 0}
                    alreadyAssigned={assigneeIds.includes(c.employee.id)}
                    onAssign={() => onAssign(c.employee.id)}
                  />
                ))}
              </div>
              {remaining > 0 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="mt-3 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-brand-50"
                >
                  Show {remaining} more
                </button>
              )}
            </>
          )}
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-brand-50/40 px-3.5 py-3">
          <CalendarClock className="h-4 w-4 mt-0.5 shrink-0 text-brand-600" />
          <p className="text-xs leading-relaxed text-ink-secondary">
            Ranked by required skills and proficiency, current and available capacity, existing workload, and
            upcoming leave. <span className="font-medium text-ink">Assignment remains a human decision.</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  best,
  alreadyAssigned,
  onAssign,
}: {
  candidate: TicketCandidate;
  best: boolean;
  alreadyAssigned: boolean;
  onAssign: () => void;
}) {
  const e: Employee = candidate.employee;
  const skillLine = candidate.matchedSkillLevels.map((s) => `${s.name}: ${s.level}`).join(" · ");
  return (
    <div className={`rounded-lg border p-3.5 ${best ? "border-2 border-brand-600 shadow-sm" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 shrink-0 rounded-full bg-brand-800 text-white text-xs font-semibold flex items-center justify-center">
            {e.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-ink">{e.name}</p>
            <p className="truncate text-xs text-ink-muted">
              {candidate.currentUtilization}% capacity{skillLine ? ` · ${skillLine}` : ""}
            </p>
          </div>
        </div>
        {best && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-800 px-2.5 py-1 text-[11px] font-semibold text-white">
            <Award className="h-3 w-3" />
            Best Match
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-ink-muted">Skill Match</p>
          <p className="tabular font-semibold text-ink">{candidate.skillMatch}%</p>
        </div>
        <div>
          <p className="text-ink-muted">Available</p>
          <p className="tabular font-semibold text-ink">{candidate.availableCapacity}%</p>
        </div>
        <div>
          <p className="text-ink-muted">If Assigned</p>
          <p className="tabular font-semibold text-ink">{candidate.projectedCapacity}%</p>
        </div>
      </div>

      <div className="mt-2.5">
        <CapacityBar value={candidate.projectedCapacity} showLabel={false} />
      </div>

      <ul className="mt-3 space-y-1">
        {candidate.reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-1.5 text-xs text-ink-secondary">
            <Clock className="h-3 w-3 mt-0.5 shrink-0 text-ink-muted" />
            {reason}
          </li>
        ))}
      </ul>

      <button
        onClick={onAssign}
        disabled={alreadyAssigned}
        className="mt-3.5 w-full rounded-lg bg-brand-800 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {alreadyAssigned ? "Already assigned" : `Assign to ${e.name.split(" ")[0]}`}
      </button>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-ink-muted">{label}</p>
      <p className="mt-0.5 font-medium text-ink">{value}</p>
    </div>
  );
}
