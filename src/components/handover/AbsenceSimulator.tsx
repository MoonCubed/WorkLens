"use client";

import { useMemo, useState } from "react";
import { Repeat2, Loader2, CheckCircle2, ChevronDown, ChevronUp, ShieldAlert, Flame, Sparkles, MessageSquare, CalendarClock, RotateCcw } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { CommentsThread } from "@/components/work/CommentsThread";
import { useWorkLog } from "@/store/work-log-store";
import { useCalendarEvents } from "@/store/calendar-events-store";
import { computeAbsenceImpact, type AbsenceImpact, type AffectedWorkItem, type CoverageCandidate, type RiskLevel } from "@/lib/absenceImpact";
import { OVERLOAD_THRESHOLD } from "@/data/config";
import { formatDisplayDate, toInputDateValue, todayLabel, addDays, isWorkingDay } from "@/lib/date";
import { withErrorDetail } from "@/lib/errorMessage";
import type { Employee } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import type { TicketCoverage } from "@/data/tickets";
import { useTickets } from "@/store/tickets-store";
import { EmployeeCapacityHover } from "@/components/employee/EmployeeCapacityHover";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const RISK_STYLES: Record<RiskLevel, { symbol: string; label: string; text: string }> = {
  Critical: { symbol: "●", label: "Critical", text: "text-[var(--status-critical)]" },
  High: { symbol: "▲", label: "High Risk", text: "text-[var(--status-serious)]" },
  Medium: { symbol: "◆", label: "Medium", text: "text-[var(--status-warning)]" },
  Low: { symbol: "○", label: "Safe", text: "text-[var(--status-good)]" },
};

/** The nearest working day `dir` steps away from `d` (−1 = the day before, 1 = after). */
function shiftToWorkingDay(d: Date, dir: 1 | -1): Date {
  let x = addDays(d, dir);
  while (!isWorkingDay(x)) x = addDays(x, dir);
  return x;
}

/** Coverage already applied to `employeeId`'s tickets — so reopening a reviewed
 * turnover shows the plan currently in force as the starting proposal. */
function existingCoverageFor(tickets: AssignedTicket[], employeeId: string): Record<string, TicketCoverage> {
  const out: Record<string, TicketCoverage> = {};
  tickets.forEach((t) => {
    if (t.coverage && t.coverage.ownerId === employeeId) out[t.id] = t.coverage;
  });
  return out;
}

export function AbsenceSimulator({
  unitEmployees,
  tickets,
  currentUserName,
  initialEmployeeId,
  initialStart,
  initialEnd,
  preferredEmployeeId,
  pendingRequestId,
  onApproveLeave,
}: {
  unitEmployees: Employee[];
  tickets: AssignedTicket[];
  currentUserName: string;
  initialEmployeeId?: string;
  initialStart?: string;
  initialEnd?: string;
  /** The peer the requesting employee nominated for the turnover — highlighted in the
   * coverage lists as a recommendation; the supervisor still decides. */
  preferredEmployeeId?: string;
  /** When this simulator was opened from a pending handover request, its id — so
   * "Confirm Handover Plan" also approves the leave. */
  pendingRequestId?: string;
  /** Approve the leave (add the leave event, mark the request reviewed). */
  onApproveLeave?: (requestId: string, start: string, end: string) => Promise<void>;
}) {
  const { getEntry } = useWorkLog();
  const { events } = useCalendarEvents();
  const { setTicketCoverage } = useTickets();
  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? unitEmployees[0]?.id ?? "");
  const [startInput, setStartInput] = useState(initialStart ? toInputDateValue(initialStart) : "");
  const [endInput, setEndInput] = useState(initialEnd ? toInputDateValue(initialEnd) : "");
  const [loading, setLoading] = useState(false);
  // The confirmed (employee, window) the impact is computed for — set once by
  // "Simulate Impact" (or immediately, reviewing a pending request). Kept separate
  // from the form inputs so adjusting the date fields doesn't recompute mid-edit.
  const [committed, setCommitted] = useState<{ employeeId: string; start: string; end: string } | null>(
    initialEmployeeId && initialStart && initialEnd ? { employeeId: initialEmployeeId, start: initialStart, end: initialEnd } : null
  );
  const [showAlternatives, setShowAlternatives] = useState<Record<string, boolean>>({});
  const [showNotes, setShowNotes] = useState<Record<string, boolean>>({});
  /** ticketId -> the PROPOSED coverage plan for this session. Purely local: passed to
   * `computeAbsenceImpact` as `stagedCoverage` so each candidate's projected capacity
   * reflects the OTHER coverage they've been proposed for — but it never changes a
   * task's owner, its remaining effort, or how much of it falls inside the absence
   * window. Nothing is written to the database until "Apply Coverage Plan". Seeded
   * from any coverage already applied to the absent employee's tickets, so reopening
   * a reviewed request shows the plan that is in force. */
  const [coverageOverrides, setCoverageOverrides] = useState<Record<string, TicketCoverage>>(() =>
    initialEmployeeId ? existingCoverageFor(tickets, initialEmployeeId) : {}
  );
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const employee = unitEmployees.find((e) => e.id === employeeId);

  // Recomputed live: the affected work + coverage requirement come from the OWNER's
  // real schedule (unchanged by any proposal); `stagedCoverage` only lets a candidate's
  // projection account for the OTHER tasks they've been proposed to cover.
  const impact = useMemo<AbsenceImpact | null>(() => {
    if (!committed) return null;
    const emp = unitEmployees.find((e) => e.id === committed.employeeId);
    if (!emp) return null;
    return computeAbsenceImpact({
      employee: emp,
      unitEmployees,
      tickets,
      startLabel: committed.start,
      endLabel: committed.end,
      getEntry,
      events,
      stagedCoverage: coverageOverrides,
    });
  }, [committed, unitEmployees, tickets, coverageOverrides, getEntry, events]);

  /** Last Working Day (the working day before the absence starts) and Return to Work
   * Day (the working day after it ends) — the clear business framing for a turnover. */
  const lwd = useMemo(() => (impact ? shiftToWorkingDay(impact.start, -1) : null), [impact]);
  const rwd = useMemo(() => (impact ? shiftToWorkingDay(impact.end, 1) : null), [impact]);

  function coveringIdFor(item: AffectedWorkItem): string | null {
    return (item.ticketId && coverageOverrides[item.ticketId]?.coveringEmployeeId) || null;
  }

  function handleSimulate() {
    if (!employee || !startInput || !endInput) return;
    setLoading(true);
    setConfirmed(false);
    setConfirmedCount(0);
    setCoverageOverrides(existingCoverageFor(tickets, employee.id));
    setShowAlternatives({});
    setShowNotes({});
    setActionError(null);
    window.setTimeout(() => {
      setCommitted({
        employeeId: employee.id,
        start: formatDisplayDate(new Date(`${startInput}T00:00:00`)),
        end: formatDisplayDate(new Date(`${endInput}T00:00:00`)),
      });
      setLoading(false);
    }, 500);
  }

  /** PROPOSE coverage for one ticket — LOCAL ONLY. Nothing is written to the database,
   * task ownership and the real schedule are untouched. It just updates the staged
   * plan so every other item's projected capacity reflects it live. Persisted only
   * when the supervisor clicks "Apply Coverage Plan". */
  function proposeCoverage(item: AffectedWorkItem, candidate: CoverageCandidate) {
    if (!impact || !item.ticketId) return;
    setActionError(null);
    const plan = impact.coveragePlanByItem.get(item.id);
    if (!plan || plan.allocations.length === 0) {
      setActionError("Nothing planned inside the leave window for this task — no coverage needed.");
      return;
    }
    const coverage: TicketCoverage = {
      coveringEmployeeId: candidate.employee.id,
      ownerId: impact.employee.id,
      ownerName: impact.employee.name,
      coveringName: candidate.employee.name,
      startDate: formatDisplayDate(impact.start),
      endDate: formatDisplayDate(impact.end),
      allocations: plan.allocations,
      hours: plan.hours,
      createdAt: todayLabel(),
    };
    setCoverageOverrides((prev) => ({ ...prev, [item.ticketId!]: coverage }));
  }

  /** Remove a proposed coverage — LOCAL ONLY (unless it was already applied, in which
   * case the DB write to clear it happens when the plan is re-applied). */
  function unproposeCoverage(item: AffectedWorkItem) {
    if (!item.ticketId) return;
    setActionError(null);
    setCoverageOverrides((prev) => {
      const next = { ...prev };
      delete next[item.ticketId!];
      return next;
    });
  }

  /** Apply Coverage Plan — the ONLY point anything is written. Persists every proposed
   * coverage to its ticket, then (for a pending request) approves the leave. */
  async function handleApplyPlan() {
    if (!impact) return;
    setActionError(null);
    setConfirming(true);
    const entries = Object.entries(coverageOverrides);
    let applied = 0;
    try {
      for (const [ticketId, coverage] of entries) {
        await setTicketCoverage(ticketId, coverage);
        applied += 1;
      }
      if (pendingRequestId && onApproveLeave) {
        await onApproveLeave(pendingRequestId, formatDisplayDate(impact.start), formatDisplayDate(impact.end));
      }
      setConfirmedCount(applied);
      setConfirmed(true);
      setShowApplyConfirm(false);
    } catch (err) {
      console.error("Failed to apply the coverage plan", err);
      setActionError(withErrorDetail("Couldn't apply the coverage plan", err));
      setShowApplyConfirm(false);
    } finally {
      setConfirming(false);
    }
  }

  const preferredEmployee = preferredEmployeeId ? unitEmployees.find((e) => e.id === preferredEmployeeId) : undefined;
  const primaryCandidate =
    impact && impact.primaryCandidateId ? unitEmployees.find((e) => e.id === impact.primaryCandidateId) : undefined;
  const itemsNeedingCoverage = impact ? impact.affectedWork.filter((i) => i.risk !== "Low") : [];
  const coverageFoundCount = itemsNeedingCoverage.filter((i) => (impact?.candidatesByItem.get(i.id) ?? []).some((c) => c.assignable)).length;
  const nameFor = (id: string) => unitEmployees.find((e) => e.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={pendingRequestId ? "Review Turnover Request" : "Simulate an Absence"}
          subtitle="What work is affected during the leave, who can cover it on those dates, and the plan to accept."
        />
        <div className="grid gap-5 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Employee</span>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="input" disabled={!!pendingRequestId}>
              {unitEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Leave from</span>
            <input type="date" value={startInput} onChange={(e) => setStartInput(e.target.value)} className="input" disabled={!!pendingRequestId} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Leave until</span>
            <input type="date" value={endInput} min={startInput || undefined} onChange={(e) => setEndInput(e.target.value)} className="input" disabled={!!pendingRequestId} />
          </label>
        </div>

        {!pendingRequestId && (
          <div className="mt-5 flex justify-end">
            <button
              onClick={handleSimulate}
              disabled={loading || !employee || !startInput || !endInput}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat2 className="h-4 w-4" />}
              {loading ? "Simulating…" : "Simulate Impact"}
            </button>
          </div>
        )}

        {impact && !loading && (
          <div className="mt-5">
            <p className="mb-2.5 text-xs text-ink-muted">
              <span className="font-medium text-ink">{impact.employee.name}</span> ·{" "}
              <span className="font-medium text-ink">LWD</span> {lwd ? formatDisplayDate(lwd) : "—"} →{" "}
              <span className="font-medium text-ink">RWD</span> {rwd ? formatDisplayDate(rwd) : "—"} ·{" "}
              absent {formatDisplayDate(impact.start)} – {formatDisplayDate(impact.end)} ·{" "}
              {impact.turnoverWorkingDays} working day{impact.turnoverWorkingDays === 1 ? "" : "s"} to cover
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryStatCard label="Work Items Affected" value={String(impact.affectedWork.length)} tone="neutral" />
              <SummaryStatCard label="Hours to Cover" value={`${impact.totalCoverageHours}h`} tone="neutral" />
              <SummaryStatCard
                label="Deadlines at Risk"
                value={String(impact.deadlinesAtRisk)}
                tone={impact.deadlinesAtRisk > 0 ? "critical" : "good"}
              />
              <SummaryStatCard
                label="Coverage Available"
                value={`${coverageFoundCount}/${itemsNeedingCoverage.length}`}
                tone={itemsNeedingCoverage.length === 0 || coverageFoundCount === itemsNeedingCoverage.length ? "good" : "critical"}
              />
            </div>
          </div>
        )}
      </Card>

      {actionError && (
        <p className="rounded-lg border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical)]">
          {actionError}
        </p>
      )}

      {preferredEmployee && (
        <Card>
          <CardHeader
            title="Preferred cover (from the employee's request)"
            subtitle="A recommendation the employee coordinated — the supervisor still makes the final call."
          />
          <p className="text-sm">
            <span className="font-medium text-ink">{preferredEmployee.name}</span>
            {impact &&
              (() => {
                const c = impact.affectedWork
                  .flatMap((i) => impact.candidatesByItem.get(i.id) ?? [])
                  .find((c) => c.employee.id === preferredEmployee.id);
                if (!c) return null;
                return (
                  <span className="ml-2 text-ink-secondary">
                    {c.onLeave
                      ? "— on leave during the turnover window, so not eligible"
                      : `— ${c.windowAvailableHours}h free during the leave, ${c.projectedCapacity}% projected`}
                  </span>
                );
              })()}
          </p>
        </Card>
      )}

      {impact && !loading && (
        <>
          <div>
            <h3 className="text-sm font-semibold text-ink mb-1">Affected Work</h3>
            <p className="mb-3 text-xs text-ink-muted">
              A proposal is a temporary coverage plan for the window between LWD and RWD — it covers only the effort the
              owner already had planned for those days, at the owner&rsquo;s own rate. The owner keeps the task and every
              hour outside that window.
            </p>
            {impact.affectedWork.length === 0 ? (
              <Card>
                <p className="text-sm text-ink-muted py-4 text-center">
                  None of {impact.employee.name}&rsquo;s work has planned effort during this leave — nothing needs
                  covering. You can still approve the leave below.
                </p>
              </Card>
            ) : Object.keys(coverageOverrides).length > 0 ? (
              <p className="mb-3 rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2 text-xs text-ink-secondary">
                {Object.keys(coverageOverrides).length} coverage proposal{Object.keys(coverageOverrides).length === 1 ? "" : "s"} staged.
                Capacity figures below are a live projection — nothing is saved and no assignment changes until you click{" "}
                <span className="font-medium text-ink">Apply Coverage Plan</span>.
              </p>
            ) : null}
            {impact.affectedWork.length > 0 && (
              <div className="space-y-3">
                {impact.affectedWork.map((item) => {
                  const allCandidates = impact.candidatesByItem.get(item.id) ?? [];
                  const candidates = allCandidates.filter((c) => c.assignable);
                  const coveringId = coveringIdFor(item);
                  const top = candidates[0];
                  const alternates = candidates.slice(1);
                  const altOpen = !!showAlternatives[item.id];
                  const notesOpen = !!showNotes[item.id];
                  const needsCoverage = item.risk !== "Low";
                  const noteKey = `${impact.employee.id}:${item.id}`;
                  const noteCount = getEntry(noteKey).comments.length;
                  const risk = RISK_STYLES[item.risk];

                  return (
                    <Card key={item.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-ink">{item.title}</p>
                          <p className="mt-1 text-xs text-ink-secondary">
                            {item.type} · {item.priority} Priority ·{" "}
                            <span className={`font-medium ${risk.text}`}>
                              <span aria-hidden="true">{risk.symbol}</span> {risk.label}
                            </span>
                          </p>
                        </div>
                        {coveringId && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                            <Sparkles className="h-3.5 w-3.5" />
                            Proposed: {nameFor(coveringId).split(" ")[0]}
                          </span>
                        )}
                      </div>

                      {/* The turnover at a glance — everything the supervisor needs to decide.
                          Ownership never transfers on a proposal: the task stays with the
                          original owner; the cover carries only the planned effort that falls
                          between LWD and RWD. */}
                      <div className="mt-3 grid gap-x-4 gap-y-1.5 rounded-lg border border-border bg-brand-50/40 p-3 text-xs sm:grid-cols-2">
                        <Row label="Original owner" value={`${impact.employee.name} (stays owner)`} />
                        <Row
                          label="Proposed coverage"
                          value={coveringId ? nameFor(coveringId) : "— none proposed"}
                        />
                        <Row label="Last working day (LWD)" value={lwd ? formatDisplayDate(lwd) : "—"} />
                        <Row label="Return to work day (RWD)" value={rwd ? formatDisplayDate(rwd) : "—"} />
                        <Row
                          label="Absence covered"
                          value={
                            item.turnoverStart
                              ? `${item.turnoverStart} – ${item.turnoverEnd} · ${item.turnoverWorkingDays} working day${item.turnoverWorkingDays === 1 ? "" : "s"}`
                              : `${item.turnoverWorkingDays} working day${item.turnoverWorkingDays === 1 ? "" : "s"}`
                          }
                        />
                        <Row label="Deadline" value={item.dueDate ?? "No deadline"} />
                        <Row label="Remaining effort (total)" value={`${item.remainingHours}h`} />
                        <Row label="Planned effort during absence" value={`${item.coverageHours}h`} />
                        <Row
                          label="Coverage required"
                          value={`${item.coverageHours}h · ${Math.round((item.remainingHours - item.coverageHours) * 10) / 10}h stays with ${impact.employee.name.split(" ")[0]} after RWD`}
                        />
                        <Row label="Status" value={item.status} />
                      </div>

                      <p className="mt-2 text-xs text-ink-muted">{item.riskExplanation}</p>

                      {!item.ticketId ? (
                        <p className="mt-3 rounded-lg border border-border bg-brand-50/40 p-3 text-xs text-ink-secondary">
                          Ad-hoc work — coordinate cover directly with the team. It isn&rsquo;t a tracked ticket, so
                          there&rsquo;s no time-boxed reassignment to apply.
                        </p>
                      ) : (
                      <div className="mt-3 text-xs">
                        <p className="font-medium uppercase tracking-wide text-ink-secondary mb-1">
                          Coverage — ranked by availability on the leave dates
                        </p>
                        {!needsCoverage && candidates.length > 0 && (
                          <p className="mb-2 flex items-center gap-1.5 text-[var(--status-good)]">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            No coverage strictly required — you can still assign someone.
                          </p>
                        )}
                        {top ? (
                          <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-3">
                            <p className="flex items-center gap-1 text-[11px] font-medium text-brand-700">
                              <Sparkles className="h-3 w-3" />
                              Suggested cover
                            </p>
                            <EmployeeCapacityHover employee={top.employee}>
                              <p className="mt-1.5 text-sm font-medium text-ink">{top.employee.name}</p>
                            </EmployeeCapacityHover>
                            <ul className="mt-1 space-y-0.5 text-xs text-ink-secondary">
                              {top.reasons.map((r, i) => (
                                <li key={i}>· {r}</li>
                              ))}
                            </ul>
                            {top.projectedCapacity > OVERLOAD_THRESHOLD && (
                              <p className="mt-1 flex items-start gap-1.5 font-medium text-[var(--status-critical)]">
                                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                Covering this would overload {top.employee.name.split(" ")[0]} during the leave.
                              </p>
                            )}
                            <div className="mt-2.5 flex items-center gap-2">
                              <button
                                onClick={() => proposeCoverage(item, top)}
                                disabled={coveringId === top.employee.id}
                                className="rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                              >
                                {coveringId === top.employee.id ? "Proposed" : `Propose ${top.employee.name.split(" ")[0]}`}
                              </button>
                              {coveringId && (
                                <button
                                  onClick={() => unproposeCoverage(item)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-brand-50"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="flex items-center gap-1.5 text-[var(--status-critical)]">
                            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                            Everyone else in the unit is on leave during this window.
                          </p>
                        )}
                      </div>
                      )}

                      <div className="mt-3.5 flex items-center gap-4 border-t border-border pt-3">
                        {item.ticketId && candidates.length > 1 && (
                          <button
                            onClick={() => setShowAlternatives((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                            className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
                          >
                            {altOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            {altOpen ? "Hide" : "Choose a different employee"}
                          </button>
                        )}
                        <button
                          onClick={() => setShowNotes((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                          className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          {notesOpen ? "Hide" : "Add"} Handover Note{noteCount > 0 ? ` (${noteCount})` : ""}
                        </button>
                      </div>

                      {altOpen && (
                        <div className="mt-3 border-t border-border pt-3">
                          <p className="mb-2 text-xs text-ink-muted">
                            All employees in the unit, ranked by their availability on the leave dates.
                          </p>
                          <div className="space-y-2">
                            {alternates.map((c) => (
                              <CoverageCandidateRow
                                key={c.employee.id}
                                candidate={c}
                                assigned={coveringId === c.employee.id}
                                onAssign={() => proposeCoverage(item, c)}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {notesOpen && (
                        <div className="mt-3 border-t border-border pt-3">
                          <CommentsThread workLogKey={noteKey} currentUserName={currentUserName} />
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <Card>
            <CardHeader
              title="Continuity Plan"
              subtitle={`${impact.employee.name} · LWD ${lwd ? formatDisplayDate(lwd) : "—"} → RWD ${rwd ? formatDisplayDate(rwd) : "—"}`}
            />
            <div className="space-y-3 text-xs">
              <PlanLine
                label={`During the absence (${formatDisplayDate(impact.start)} – ${formatDisplayDate(impact.end)})`}
                body={
                  primaryCandidate || Object.keys(coverageOverrides).length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-ink-secondary">
                      {impact.affectedWork
                        .filter((i) => i.risk !== "Low")
                        .map((i) => {
                          const cid = coveringIdFor(i) ?? (impact.candidatesByItem.get(i.id) ?? []).find((c) => c.eligible)?.employee.id;
                          return (
                            <li key={i.id}>
                              <span className="font-medium text-ink">{cid ? nameFor(cid).split(" ")[0] : "— unassigned"}</span> covers{" "}
                              {i.title} — {i.coverageHours}h of the {i.remainingHours}h remaining, across {i.turnoverWorkingDays} working day{i.turnoverWorkingDays === 1 ? "" : "s"}
                            </li>
                          );
                        })}
                    </ul>
                  ) : (
                    <span className="text-ink-muted"> No coverage identified yet.</span>
                  )
                }
              />
              <PlanLine
                label={`From RWD (${rwd ? formatDisplayDate(rwd) : "return"})`}
                body={
                  <span className="text-ink-secondary">
                    {" "}
                    Every task stays owned by <span className="font-medium text-ink">{impact.employee.name}</span>, who
                    resumes the remaining effort. Coverage ends automatically on {formatDisplayDate(impact.end)}.
                  </span>
                }
              />
            </div>

            {confirmed ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-3.5 py-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--status-good)]" />
                <p className="text-xs font-medium text-[var(--status-good)]">
                  {confirmedCount > 0
                    ? `Coverage plan applied — ${confirmedCount} task${confirmedCount === 1 ? "" : "s"} covered for the leave window`
                    : "No coverage was needed"}
                  {pendingRequestId && onApproveLeave ? ", and the leave is approved" : ""}.
                </p>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                {pendingRequestId && onApproveLeave && impact.affectedWork.length === 0 && (
                  <button
                    onClick={() => setShowApplyConfirm(true)}
                    disabled={confirming}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                    Approve leave (no coverage needed)
                  </button>
                )}
                {impact.affectedWork.length > 0 && (
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={() => setShowApplyConfirm(true)}
                      disabled={confirming || Object.keys(coverageOverrides).length === 0}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                      {confirming ? "Applying…" : pendingRequestId ? "Accept Turnover & Approve Leave" : "Apply Coverage Plan"}
                    </button>
                    {Object.keys(coverageOverrides).length === 0 && (
                      <p className="text-[11px] text-ink-muted">Propose coverage for at least one task first.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      {showApplyConfirm && impact && (
        <ConfirmDialog
          title={pendingRequestId ? "Accept turnover & approve leave?" : "Apply coverage plan?"}
          busy={confirming}
          body={
            <>
              {Object.keys(coverageOverrides).length > 0 ? (
                <>
                  This writes {Object.keys(coverageOverrides).length} time-boxed coverage assignment
                  {Object.keys(coverageOverrides).length === 1 ? "" : "s"} for{" "}
                  <span className="font-medium text-ink">{impact.employee.name}</span>&rsquo;s leave
                  ({formatDisplayDate(impact.start)} – {formatDisplayDate(impact.end)}). Covering employees&rsquo;
                  schedules and capacity update immediately.
                </>
              ) : (
                <>
                  This approves <span className="font-medium text-ink">{impact.employee.name}</span>&rsquo;s leave
                  ({formatDisplayDate(impact.start)} – {formatDisplayDate(impact.end)}). No coverage is needed.
                </>
              )}
              {pendingRequestId && onApproveLeave ? " The leave request is marked approved." : ""}
            </>
          }
          confirmLabel={pendingRequestId ? "Accept & Approve" : "Apply Plan"}
          onConfirm={handleApplyPlan}
          onCancel={() => setShowApplyConfirm(false)}
        />
      )}
    </div>
  );
}

const SUMMARY_TONE_STYLES: Record<"neutral" | "good" | "critical", { box: string; text: string }> = {
  neutral: { box: "border-border bg-brand-50/40", text: "text-ink" },
  good: { box: "border-[var(--status-good-border)] bg-[var(--status-good-bg)]", text: "text-[var(--status-good)]" },
  critical: { box: "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]", text: "text-[var(--status-critical)]" },
};

function SummaryStatCard({ label, value, tone }: { label: string; value: string; tone: "neutral" | "good" | "critical" }) {
  const styles = SUMMARY_TONE_STYLES[tone];
  return (
    <div className={`rounded-lg border p-3 ${styles.box}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-secondary">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular ${styles.text}`}>{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-ink-muted">{label}: </span>
      <span className="font-medium text-ink">{value}</span>
    </p>
  );
}

function PlanLine({ label, body }: { label: string; body: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold uppercase tracking-wide text-ink-secondary">{label}</p>
      {body}
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

function CoverageCandidateRow({
  candidate,
  assigned,
  onAssign,
}: {
  candidate: CoverageCandidate;
  assigned: boolean;
  onAssign: () => void;
}) {
  const e = candidate.employee;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-full bg-brand-800 text-white text-xs font-semibold flex items-center justify-center">
            {e.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
          </div>
          <div className="min-w-0 leading-tight">
            <EmployeeCapacityHover employee={e}>
              <p className="truncate text-sm font-medium text-ink">{e.name}</p>
            </EmployeeCapacityHover>
            <p className="truncate text-xs text-ink-muted">{e.department}</p>
          </div>
        </div>
        <button
          onClick={onAssign}
          disabled={assigned}
          className="shrink-0 rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {assigned ? "Proposed" : `Propose ${e.name.split(" ")[0]}`}
        </button>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2.5 text-xs">
        <Detail label="Free in window" value={`${Math.max(0, candidate.windowAvailableHours)}h`} />
        <Detail label="After cover" value={`${candidate.projectedCapacity}%`} />
        <Detail label="Skill match" value={`${candidate.skillMatch}%`} />
      </div>
      {candidate.excludeReason && (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-[var(--status-warning)]">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {candidate.excludeReason}
        </p>
      )}
    </div>
  );
}
