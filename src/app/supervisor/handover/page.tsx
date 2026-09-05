"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { AbsenceSimulator } from "@/components/handover/AbsenceSimulator";
import type { LeaveEvent } from "@/data/types";
import { useEmployees } from "@/store/employees-store";
import { useHandoverRequests, type HandoverRequest } from "@/store/handover-requests-store";
import { useTickets } from "@/store/tickets-store";
import { useWorkLog } from "@/store/work-log-store";
import { useSupervisorSession } from "@/store/session-store";
import { getDepartmentSupervisor, getUnitTeam } from "@/lib/hr";
import { findLeaveOverlaps } from "@/lib/absenceImpact";
import { parseLooseDate, countWorkingDays } from "@/lib/date";
import { EmployeeCapacityHover } from "@/components/employee/EmployeeCapacityHover";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { withErrorDetail } from "@/lib/errorMessage";

function nextLeaveId(existing: LeaveEvent[]): string {
  const numbers = existing.map((l) => Number(l.id.replace("l", ""))).filter((n) => !Number.isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `l${next}`;
}

export default function HandoverPlannerPage() {
  const { unit } = useSupervisorSession();
  const { employees, updateEmployee } = useEmployees();
  const { requests, resolve } = useHandoverRequests();
  const { tickets } = useTickets();
  useWorkLog();
  const [review, setReview] = useState<{ requestId?: string; employeeId: string; start: string; end: string; preferredId?: string | null } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<HandoverRequest | null>(null);
  const [declining, setDeclining] = useState(false);

  const unitEmployees = useMemo(() => getUnitTeam(unit, employees), [employees, unit]);
  const currentSupervisorName = getDepartmentSupervisor(unit, employees)?.name ?? "Supervisor";
  const pending = requests.filter(
    (r) => r.status === "Pending Supervisor Review" && unitEmployees.some((e) => e.id === r.employeeId)
  );

  /** Approve the leave: add the approved leave event (if not already present) and mark
   * the request approved. Called from the simulator's "Accept Turnover" flow. */
  async function approveLeave(requestId: string, start: string, end: string) {
    const r = requests.find((x) => x.id === requestId);
    const employee = employees.find((e) => e.id === (r?.employeeId ?? ""));
    if (!employee) return;
    const already = employee.leaveEvents.some((l) => l.start === start && l.end === end);
    if (!already) {
      const leave: LeaveEvent = { id: nextLeaveId(employee.leaveEvents), type: "Leave", start, end, status: "Approved" };
      await updateEmployee(employee.id, { leaveEvents: [...employee.leaveEvents, leave] });
    }
    if (r) await resolve(r.id, "Approved");
  }

  async function declineLeave(r: HandoverRequest, reason?: string) {
    if (!reason || !reason.trim()) {
      setActionError("A justification is required to reject a turnover request.");
      return;
    }
    setActionError(null);
    setDeclining(true);
    try {
      await resolve(r.id, "Rejected", reason);
      setDeclineTarget(null);
    } catch (err) {
      console.error("Failed to reject the turnover request", err);
      setActionError(withErrorDetail("Couldn't reject this request", err));
      setDeclineTarget(null);
    } finally {
      setDeclining(false);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Handover &amp; Continuity Planner</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Review a leave request, see the work affected during those dates, and arrange time-boxed coverage — ownership
          stays with the person taking leave.
        </p>
      </div>

      {actionError && (
        <p className="rounded-lg border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical)]">
          {actionError}
        </p>
      )}

      {pending.length > 0 && (
        <Card>
          <CardHeader
            title="Incoming Turnover Requests"
            subtitle="Leave requests from your team — review each to arrange coverage and approve"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2.5 py-1 text-xs font-medium text-[var(--status-warning)]">
                <Inbox className="h-3.5 w-3.5" />
                {pending.length} pending
              </span>
            }
          />
          <ul className="divide-y divide-border">
            {pending.map((r) => {
              const employee = unitEmployees.find((e) => e.id === r.employeeId);
              const reqStart = parseLooseDate(r.startDate);
              const reqEnd = parseLooseDate(r.endDate);
              const overlaps =
                reqStart && reqEnd ? findLeaveOverlaps(r.employeeId, reqStart, reqEnd, unitEmployees, pending) : [];
              const workingDays = reqStart && reqEnd ? countWorkingDays(reqStart, reqEnd) : null;
              const preferred = r.preferredEmployeeId ? employees.find((e) => e.id === r.preferredEmployeeId) : undefined;
              const isOpen = review?.requestId === r.id;

              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3.5">
                  <div>
                    {employee ? (
                      <EmployeeCapacityHover employee={employee}>
                        <p className="text-sm font-medium text-ink">{employee.name}</p>
                      </EmployeeCapacityHover>
                    ) : (
                      <p className="text-sm font-medium text-ink">{r.employeeId}</p>
                    )}
                    <p className="text-xs text-ink-muted mt-0.5">
                      Leave · {r.startDate} – {r.endDate}
                      {workingDays !== null && ` · ${workingDays} working day${workingDays === 1 ? "" : "s"}`}
                      {r.submittedAt && ` · submitted ${r.submittedAt}`}
                    </p>
                    {r.note && <p className="text-xs text-ink-secondary mt-1 italic">&ldquo;{r.note}&rdquo;</p>}
                    {preferred && (
                      <p className="mt-1 text-xs text-ink-secondary">
                        Suggested cover: <span className="font-medium text-ink">{preferred.name}</span> (coordinated by{" "}
                        {employee?.name.split(" ")[0]})
                      </p>
                    )}
                    {overlaps.length > 0 && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-xs text-[var(--status-warning)]">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium">Overlap with another absence</p>
                          {overlaps.map((o, i) => (
                            <p key={i}>
                              {o.employeeName} is also {o.confirmed ? "on approved leave" : "requesting leave"} · {o.start} – {o.end} ·{" "}
                              {o.overlapDays} overlapping day{o.overlapDays === 1 ? "" : "s"}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() =>
                        setReview(
                          isOpen
                            ? null
                            : { requestId: r.id, employeeId: r.employeeId, start: r.startDate, end: r.endDate, preferredId: r.preferredEmployeeId }
                        )
                      }
                      className="rounded-lg bg-brand-800 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      {isOpen ? "Close" : "Review & Arrange Coverage"}
                    </button>
                    <button
                      onClick={() => setDeclineTarget(r)}
                      className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-brand-50"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <AbsenceSimulator
        key={review ? `${review.employeeId}-${review.start}-${review.end}` : "default"}
        unitEmployees={unitEmployees}
        tickets={tickets}
        currentUserName={currentSupervisorName}
        initialEmployeeId={review?.employeeId}
        initialStart={review?.start}
        initialEnd={review?.end}
        preferredEmployeeId={review?.preferredId ?? undefined}
        pendingRequestId={review?.requestId}
        onApproveLeave={approveLeave}
      />

      {declineTarget && (
        <ConfirmDialog
          title="Reject Turnover?"
          tone="danger"
          busy={declining}
          confirmLabel="Reject Request"
          requireReason
          reasonLabel="Justification"
          reasonPlaceholder="e.g. Coverage is already available within the current project team, so a temporary handover is not required."
          body={
            <>
              {(() => {
                const emp = unitEmployees.find((e) => e.id === declineTarget.employeeId);
                return (
                  <>
                    Reject <span className="font-medium text-ink">{emp?.name ?? declineTarget.employeeId}</span>&rsquo;s leave
                    request for {declineTarget.startDate} – {declineTarget.endDate}. No coverage will be arranged and the
                    reason below is shown to the employee.
                  </>
                );
              })()}
            </>
          }
          onConfirm={(reason) => declineLeave(declineTarget, reason)}
          onCancel={() => setDeclineTarget(null)}
        />
      )}
    </div>
  );
}
