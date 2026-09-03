"use client";

import { useState } from "react";
import { Repeat2, Loader2, CheckCircle2, ChevronDown, ChevronUp, ShieldAlert, Flame, Sparkles, MessageSquare, CalendarClock, RotateCcw } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { CommentsThread } from "@/components/work/CommentsThread";
import { useWorkLog } from "@/store/work-log-store";
import { useCalendarEvents } from "@/store/calendar-events-store";
import { computeAbsenceImpact, type AbsenceImpact, type AffectedWorkItem, type CoverageCandidate, type RiskLevel } from "@/lib/absenceImpact";
import { OVERLOAD_THRESHOLD } from "@/data/config";
import { formatDisplayDate, toInputDateValue, todayLabel } from "@/lib/date";
import type { Employee } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import type { TicketCoverage } from "@/data/tickets";
import { useTickets } from "@/store/tickets-store";

const RISK_STYLES: Record<RiskLevel, { symbol: string; label: string; text: string }> = {
  Critical: { symbol: "●", label: "Critical", text: "text-[var(--status-critical)]" },
  High: { symbol: "▲", label: "High Risk", text: "text-[var(--status-serious)]" },
  Medium: { symbol: "◆", label: "Medium", text: "text-[var(--status-warning)]" },
  Low: { symbol: "○", label: "Safe", text: "text-[var(--status-good)]" },
};

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
  const [impact, setImpact] = useState<AbsenceImpact | null>(() => {
    if (!initialEmployeeId || !initialStart || !initialEnd) return null;
    const e = unitEmployees.find((x) => x.id === initialEmployeeId);
    if (!e) return null;
    return computeAbsenceImpact({ employee: e, unitEmployees, tickets, startLabel: initialStart, endLabel: initialEnd, getEntry, events });
  });
  const [showAlternatives, setShowAlternatives] = useState<Record<string, boolean>>({});
  const [showNotes, setShowNotes] = useState<Record<string, boolean>>({});
  /** itemId -> covering employee id (locally, reflecting what we've applied). */
  const [coverBy, setCoverBy] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const employee = unitEmployees.find((e) => e.id === employeeId);

  function refreshImpact(emp: Employee, startLabel: string, endLabel: string) {
    return computeAbsenceImpact({ employee: emp, unitEmployees, tickets, startLabel, endLabel, getEntry, events });
  }

  function handleSimulate() {
    if (!employee || !startInput || !endInput) return;
    setLoading(true);
    setConfirmed(false);
    setConfirmedCount(0);
    setCoverBy({});
    setShowAlternatives({});
    setShowNotes({});
    setActionError(null);
    window.setTimeout(() => {
      setImpact(
        refreshImpact(
          employee,
          formatDisplayDate(new Date(`${startInput}T00:00:00`)),
          formatDisplayDate(new Date(`${endInput}T00:00:00`))
        )
      );
      setLoading(false);
    }, 500);
  }

  /** Build and store the time-boxed coverage plan for one affected ticket. */
  async function applyCoverage(item: AffectedWorkItem, candidate: CoverageCandidate) {
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
    try {
      await setTicketCoverage(item.ticketId, coverage);
      setCoverBy((prev) => ({ ...prev, [item.id]: candidate.employee.id }));
    } catch {
      setActionError("Couldn't set up coverage — check your connection and try again.");
    }
  }

  async function clearCoverage(item: AffectedWorkItem) {
    if (!item.ticketId) return;
    setActionError(null);
    try {
      await setTicketCoverage(item.ticketId, null);
      setCoverBy((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } catch {
      setActionError("Couldn't clear coverage — check your connection and try again.");
    }
  }

  async function handleConfirmPlan() {
    if (!impact) return;
    setActionError(null);
    setConfirming(true);
    let applied = 0;
    try {
      for (const item of impact.affectedWork) {
        if (item.risk === "Low" || !item.ticketId) continue;
        if (coverBy[item.id]) {
          applied += 1;
          continue;
        }
        const list = impact.candidatesByItem.get(item.id) ?? [];
        const top = list.find((c) => c.eligible) ?? list.find((c) => c.assignable && !c.overloaded);
        if (!top) continue;
        await applyCoverage(item, top);
        applied += 1;
      }
      if (pendingRequestId && onApproveLeave) {
        await onApproveLeave(pendingRequestId, formatDisplayDate(impact.start), formatDisplayDate(impact.end));
      }
      setConfirmedCount(applied);
      setConfirmed(true);
    } catch {
      setActionError("Couldn't confirm the handover plan — check your connection and try again.");
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
              <span className="font-medium text-ink">{impact.employee.name}</span> · leave {formatDisplayDate(impact.start)} – {formatDisplayDate(impact.end)} ·{" "}
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
              Coverage is time-boxed to the leave window and keeps the task&rsquo;s existing per-day plan — ownership does
              not transfer.
            </p>
            {impact.affectedWork.length === 0 ? (
              <Card>
                <p className="text-sm text-ink-muted py-4 text-center">
                  None of {impact.employee.name}&rsquo;s work has planned effort during this leave — nothing needs
                  covering. You can still approve the leave below.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {impact.affectedWork.map((item) => {
                  const allCandidates = impact.candidatesByItem.get(item.id) ?? [];
                  const candidates = allCandidates.filter((c) => c.assignable);
                  const coveringId = coverBy[item.id] ?? null;
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
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-2.5 py-1 text-xs font-medium text-[var(--status-good)]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Covered by {nameFor(coveringId).split(" ")[0]}
                          </span>
                        )}
                      </div>

                      {/* The turnover at a glance — everything the supervisor needs to decide. */}
                      <div className="mt-3 grid gap-x-4 gap-y-1.5 rounded-lg border border-border bg-brand-50/40 p-3 text-xs sm:grid-cols-2">
                        <Row label="Original owner" value={impact.employee.name} />
                        <Row label="Coverage employee" value={coveringId ? nameFor(coveringId) : "— not selected"} />
                        <Row label="Leave period" value={`${formatDisplayDate(impact.start)} – ${formatDisplayDate(impact.end)}`} />
                        <Row
                          label="Turnover period"
                          value={
                            item.turnoverStart
                              ? `${item.turnoverStart} – ${item.turnoverEnd} · ${item.turnoverWorkingDays} day${item.turnoverWorkingDays === 1 ? "" : "s"}`
                              : `${item.turnoverWorkingDays} working day${item.turnoverWorkingDays === 1 ? "" : "s"}`
                          }
                        />
                        <Row label="Deadline" value={item.dueDate ?? "No deadline"} />
                        <Row label="Remaining effort" value={`${item.remainingHours}h`} />
                        <Row label="Planned effort during leave" value={`${item.coverageHours}h (owner's rate, unchanged)`} />
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
                            <p className="mt-1.5 text-sm font-medium text-ink">{top.employee.name}</p>
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
                                onClick={() => applyCoverage(item, top)}
                                disabled={coveringId === top.employee.id}
                                className="rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                              >
                                {coveringId === top.employee.id ? "Assigned" : `Assign coverage to ${top.employee.name.split(" ")[0]}`}
                              </button>
                              {coveringId && (
                                <button
                                  onClick={() => clearCoverage(item)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-brand-50"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Clear
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
                                onAssign={() => applyCoverage(item, c)}
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
              subtitle={`${impact.employee.name} · ${formatDisplayDate(impact.start)} – ${formatDisplayDate(impact.end)}`}
            />
            <div className="space-y-3 text-xs">
              <PlanLine
                label="During the leave"
                body={
                  primaryCandidate || Object.keys(coverBy).length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-ink-secondary">
                      {impact.affectedWork
                        .filter((i) => i.risk !== "Low")
                        .map((i) => {
                          const cid = coverBy[i.id] ?? (impact.candidatesByItem.get(i.id) ?? []).find((c) => c.eligible)?.employee.id;
                          return (
                            <li key={i.id}>
                              <span className="font-medium text-ink">{cid ? nameFor(cid).split(" ")[0] : "— unassigned"}</span> covers{" "}
                              {i.title} ({i.coverageHours}h across {i.turnoverWorkingDays} day{i.turnoverWorkingDays === 1 ? "" : "s"})
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
                label="After return"
                body={
                  <span className="text-ink-secondary">
                    {" "}
                    All tasks stay owned by <span className="font-medium text-ink">{impact.employee.name}</span>; coverage
                    ends automatically on {formatDisplayDate(impact.end)}.
                  </span>
                }
              />
            </div>

            {confirmed ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-3.5 py-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--status-good)]" />
                <p className="text-xs font-medium text-[var(--status-good)]">
                  Turnover accepted — {confirmedCount} task{confirmedCount === 1 ? "" : "s"} covered for the leave window
                  {pendingRequestId && onApproveLeave ? ", and the leave is approved" : ""}.
                </p>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                {pendingRequestId && onApproveLeave && impact.affectedWork.length === 0 && (
                  <button
                    onClick={handleConfirmPlan}
                    disabled={confirming}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                    Approve leave (no coverage needed)
                  </button>
                )}
                {impact.affectedWork.length > 0 && (
                  <button
                    onClick={handleConfirmPlan}
                    disabled={confirming || coverageFoundCount === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                    {confirming ? "Confirming…" : pendingRequestId ? "Accept Turnover & Approve Leave" : "Apply Coverage Plan"}
                  </button>
                )}
              </div>
            )}
          </Card>
        </>
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
            <p className="truncate text-sm font-medium text-ink">{e.name}</p>
            <p className="truncate text-xs text-ink-muted">{e.department}</p>
          </div>
        </div>
        <button
          onClick={onAssign}
          disabled={assigned}
          className="shrink-0 rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {assigned ? "Assigned" : `Assign to ${e.name.split(" ")[0]}`}
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
