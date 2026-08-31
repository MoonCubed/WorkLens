"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { AbsenceSimulator } from "@/components/handover/AbsenceSimulator";
import type { LeaveEvent } from "@/data/types";
import { useEmployees } from "@/store/employees-store";
import { useHandoverRequests, type HandoverRequest } from "@/store/handover-requests-store";
import { useTickets } from "@/store/tickets-store";
import { useSupervisorSession } from "@/store/session-store";
import { getDepartmentSupervisor, getUnitTeam } from "@/lib/hr";
import { findLeaveOverlaps, countWorkingDays } from "@/lib/absenceImpact";
import { parseLooseDate } from "@/lib/date";

function nextLeaveId(existing: LeaveEvent[]): string {
  const numbers = existing.map((l) => Number(l.id.replace("l", ""))).filter((n) => !Number.isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `l${next}`;
}

export default function HandoverPlannerPage() {
  const { unit } = useSupervisorSession();
  const { employees, updateEmployee } = useEmployees();
  const { requests, markReviewed } = useHandoverRequests();
  const { tickets } = useTickets();
  const [review, setReview] = useState<{ employeeId: string; start: string; end: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const unitEmployees = useMemo(() => getUnitTeam(unit, employees), [employees, unit]);
  const currentSupervisorName = getDepartmentSupervisor(unit, employees)?.name ?? "Supervisor";
  const pending = requests.filter(
    (r) => r.status === "Pending Supervisor Review" && unitEmployees.some((e) => e.id === r.employeeId)
  );

  async function approveLeave(r: HandoverRequest) {
    setActionError(null);
    const employee = employees.find((e) => e.id === r.employeeId);
    if (!employee) return;
    const leave: LeaveEvent = {
      id: nextLeaveId(employee.leaveEvents),
      type: r.leaveType ?? "Annual Leave",
      start: r.startDate,
      end: r.endDate,
      status: "Approved",
    };
    try {
      await updateEmployee(employee.id, { leaveEvents: [...employee.leaveEvents, leave] });
      await markReviewed(r.id);
    } catch {
      setActionError("Couldn't approve this leave — check your connection and try again.");
    }
  }

  async function declineLeave(r: HandoverRequest) {
    setActionError(null);
    try {
      await markReviewed(r.id);
    } catch {
      setActionError("Couldn't decline this request — check your connection and try again.");
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Handover &amp; Continuity Planner</h1>
        <p className="mt-1 text-sm text-ink-muted">
          If an employee becomes unavailable, identify affected work, risks, and available coverage.
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
            title="Incoming Handover Requests"
            subtitle="Submitted by employees from their portal"
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
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-ink">{employee?.name ?? r.employeeId}</p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {r.leaveType ?? "Leave"} · {r.startDate} – {r.endDate}
                      {workingDays !== null && ` · ${workingDays} working day${workingDays === 1 ? "" : "s"}`}
                    </p>
                    {r.note && <p className="text-xs text-ink-secondary mt-1 italic">&ldquo;{r.note}&rdquo;</p>}
                    {overlaps.length > 0 && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-xs text-[var(--status-warning)]">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium">Overlap detected</p>
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
                      onClick={() => setReview({ employeeId: r.employeeId, start: r.startDate, end: r.endDate })}
                      className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-brand-50"
                    >
                      Review
                    </button>
                    <button
                      onClick={() => declineLeave(r)}
                      className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-brand-50"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => approveLeave(r)}
                      className="rounded-lg bg-brand-800 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      Approve
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
      />
    </div>
  );
}
