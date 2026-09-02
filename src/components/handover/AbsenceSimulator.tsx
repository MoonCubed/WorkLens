"use client";

import { useState } from "react";
import { Repeat2, Loader2, AlertTriangle, CheckCircle2, Award, ChevronDown, ChevronUp, ShieldAlert, Flame, Sparkles, MessageSquare } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { CommentsThread } from "@/components/work/CommentsThread";
import { useWorkLog } from "@/store/work-log-store";
import { computeAbsenceImpact, type AbsenceImpact, type AffectedWorkItem, type CoverageCandidate, type RiskLevel } from "@/lib/absenceImpact";
import { CAPACITY_THRESHOLDS, OVERLOAD_THRESHOLD } from "@/data/config";
import { formatDisplayDate, toInputDateValue } from "@/lib/date";
import type { Employee } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
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
}) {
  const { assignTicketToEmployee } = useTickets();
  const { getEntry } = useWorkLog();
  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? unitEmployees[0]?.id ?? "");
  const [startInput, setStartInput] = useState(initialStart ? toInputDateValue(initialStart) : "");
  const [endInput, setEndInput] = useState(initialEnd ? toInputDateValue(initialEnd) : "");
  const [loading, setLoading] = useState(false);
  // "Review" jumps here with a request already picked — computed synchronously on first
  // render (the parent remounts this component via `key` for each such jump), so it
  // reads as a direct drill-down rather than a fresh action requiring another click.
  const [impact, setImpact] = useState<AbsenceImpact | null>(() => {
    if (!initialEmployeeId || !initialStart || !initialEnd) return null;
    const e = unitEmployees.find((x) => x.id === initialEmployeeId);
    if (!e) return null;
    return computeAbsenceImpact({
      employee: e,
      unitEmployees,
      tickets,
      startLabel: initialStart,
      endLabel: initialEnd,
    });
  });
  const [showAlternatives, setShowAlternatives] = useState<Record<string, boolean>>({});
  const [showNotes, setShowNotes] = useState<Record<string, boolean>>({});
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const employee = unitEmployees.find((e) => e.id === employeeId);

  function handleSimulate() {
    if (!employee || !startInput || !endInput) return;
    setLoading(true);
    setConfirmed(false);
    setConfirmedCount(0);
    setAssignments({});
    setShowAlternatives({});
    setShowNotes({});
    setActionError(null);
    window.setTimeout(() => {
      setImpact(
        computeAbsenceImpact({
          employee,
          unitEmployees,
          tickets,
          startLabel: formatDisplayDate(new Date(`${startInput}T00:00:00`)),
          endLabel: formatDisplayDate(new Date(`${endInput}T00:00:00`)),
        })
      );
      setLoading(false);
    }, 600);
  }

  async function handleAssign(item: AffectedWorkItem, candidate: CoverageCandidate) {
    setActionError(null);
    if (item.ticketId) {
      try {
        await assignTicketToEmployee(item.ticketId, candidate.employee.id);
      } catch {
        setActionError("Couldn't reassign this ticket — check your connection and try again.");
        return;
      }
    }
    setAssignments((prev) => ({ ...prev, [item.id]: candidate.employee.id }));
  }

  async function handleConfirmPlan() {
    if (!impact) return;
    setActionError(null);
    setConfirming(true);
    let applied = 0;
    for (const item of impact.affectedWork) {
      if (item.risk === "Low") continue;
      const currentOwnerIds = assignments[item.id]
        ? [assignments[item.id]]
        : (item.ticketId ? tickets.find((t) => t.id === item.ticketId)?.assignedEmployeeIds : undefined) ?? [];
      const list = impact.candidatesByItem.get(item.id) ?? [];
      const top = list.find((c) => c.eligible) ?? list.find((c) => c.assignable && !c.overloaded);
      if (!top || currentOwnerIds.includes(top.employee.id)) continue;
      await handleAssign(item, top);
      applied += 1;
    }
    setConfirmedCount(applied);
    setConfirming(false);
    setConfirmed(true);
  }

  const preferredEmployee = preferredEmployeeId ? unitEmployees.find((e) => e.id === preferredEmployeeId) : undefined;
  const primaryCandidate =
    impact && impact.primaryCandidateId ? unitEmployees.find((e) => e.id === impact.primaryCandidateId) : undefined;
  const urgentItems = impact ? impact.affectedWork.filter((i) => i.risk === "Critical" || i.risk === "High") : [];
  const itemsNeedingCoverage = impact ? impact.affectedWork.filter((i) => i.risk !== "Low") : [];
  // Coverage is "found" whenever there's anyone in the unit who can take it on — a
  // missing skill match is a ranking concern, not a blocker.
  const coverageFoundCount = itemsNeedingCoverage.filter((i) => (impact?.candidatesByItem.get(i.id) ?? []).some((c) => c.assignable)).length;
  const anyCoverageSuggested = coverageFoundCount > 0;
  const nameFor = (id: string) => unitEmployees.find((e) => e.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Simulate an Absence" subtitle="See what work is affected, what deadlines are at risk, and who can cover it." />
        <div className="grid gap-5 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Employee</span>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="input">
              {unitEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Unavailable From</span>
            <input type="date" value={startInput} onChange={(e) => setStartInput(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Unavailable Until</span>
            <input type="date" value={endInput} min={startInput || undefined} onChange={(e) => setEndInput(e.target.value)} className="input" />
          </label>
        </div>

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

        {impact && !loading && (
          <div className="mt-5">
            <p className="mb-2.5 text-xs text-ink-muted">
              <span className="font-medium text-ink">{impact.employee.name}&rsquo;s</span> absence, {formatDisplayDate(impact.start)} – {formatDisplayDate(impact.end)}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryStatCard label="Work Items Affected" value={String(impact.affectedWork.length)} tone="neutral" />
              <SummaryStatCard label="Hours Remaining" value={`${impact.totalEstimatedHours}h`} tone="neutral" />
              <SummaryStatCard
                label="Deadlines at Risk"
                value={String(impact.deadlinesAtRisk)}
                tone={impact.deadlinesAtRisk > 0 ? "critical" : "good"}
              />
              <SummaryStatCard
                label="Suitable Coverage"
                value={String(coverageFoundCount)}
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
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="font-medium text-ink">{preferredEmployee.name}</span>
            <span className="text-ink-secondary">
              Current utilization: <span className="font-medium text-ink">{preferredEmployee.currentUtilization}%</span>
            </span>
            {preferredEmployee.currentUtilization >= CAPACITY_THRESHOLDS.atRisk.max && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--status-critical)]">
                <ShieldAlert className="h-3.5 w-3.5" />
                Already at/above the {CAPACITY_THRESHOLDS.atRisk.max}% overload threshold
              </span>
            )}
          </div>
        </Card>
      )}

      {impact && !loading && (
        <>
          {/* Affected Work — the main section */}
          <div>
            <h3 className="text-sm font-semibold text-ink mb-3">Affected Work</h3>
            {impact.affectedWork.length === 0 ? (
              <Card>
                <p className="text-sm text-ink-muted py-4 text-center">
                  None of {impact.employee.name}&rsquo;s work has planned effort during this period — nothing needs handover.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {impact.affectedWork.map((item) => {
                  const allCandidates = impact.candidatesByItem.get(item.id) ?? [];
                  // Everyone who can be assigned — the same "all employees, ranked by
                  // suitability" experience as Unassigned Tasks. Only people on leave
                  // during the absence are excluded.
                  const candidates = allCandidates.filter((c) => c.assignable);
                  const liveOwnerIds =
                    (item.ticketId ? tickets.find((t) => t.id === item.ticketId)?.assignedEmployeeIds : undefined) ?? [];
                  const assignedIds = assignments[item.id] ? [assignments[item.id]] : liveOwnerIds;
                  const top = candidates[0];
                  const alternates = candidates.slice(1);
                  const altOpen = !!showAlternatives[item.id];
                  const notesOpen = !!showNotes[item.id];
                  const needsCoverage = item.risk !== "Low";
                  const noteKey = `${impact.employee.id}:${item.id}`;
                  const noteCount = getEntry(noteKey).comments.length;
                  const risk = RISK_STYLES[item.risk];
                  // Ownership: the absent employee still owns this work; a coverage
                  // employee is picked to keep it moving during the leave.
                  const handoverToId = assignments[item.id] ?? null;

                  return (
                    <Card key={item.id}>
                      <p className="text-sm font-semibold text-ink">{item.title}</p>
                      <p className="mt-1 text-xs text-ink-secondary">
                        {item.type} · {item.priority} Priority ·{" "}
                        <span className={`font-medium ${risk.text}`}>
                          <span aria-hidden="true">{risk.symbol}</span> {risk.label}
                        </span>
                      </p>

                      {/* Who leads and who owns this work — always visible so the
                          supervisor knows the chain even after picking coverage. */}
                      <div className="mt-3 rounded-lg border border-border bg-brand-50/40 p-3 text-xs">
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          <p>
                            <span className="text-ink-muted">Primary Project Leader: </span>
                            <span className="font-medium text-ink">{currentUserName}</span>
                          </p>
                          <p>
                            <span className="text-ink-muted">Current Owner: </span>
                            <span className="font-medium text-ink">{impact.employee.name}</span>
                          </p>
                          <p>
                            <span className="text-ink-muted">Status: </span>
                            <span className="font-medium text-ink">{item.status}</span>
                          </p>
                          <p>
                            <span className="text-ink-muted">Handover To: </span>
                            <span className="font-medium text-ink">
                              {handoverToId ? nameFor(handoverToId) : "— not selected"}
                            </span>
                          </p>
                        </div>
                        <p className="mt-1.5 text-ink-muted">
                          {impact.employee.name} is going on leave {formatDisplayDate(impact.start)} – {formatDisplayDate(impact.end)} and
                          still owns this task — coverage keeps it moving; the status and ownership don&rsquo;t change.
                        </p>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                        <Detail label="Remaining effort" value={`${item.remainingHours}h`} />
                        <Detail label="Due date" value={item.dueDate ?? "No deadline"} />
                        <Detail label="Absence overlap" value={`${item.overlapDays} day${item.overlapDays === 1 ? "" : "s"}`} />
                      </div>

                      <div className="mt-3 text-xs">
                        <p className="font-medium uppercase tracking-wide text-ink-secondary">Risk</p>
                        <p className="mt-0.5 text-ink-secondary">{item.riskExplanation}</p>
                      </div>

                      <div className="mt-3 text-xs">
                        <p className="font-medium uppercase tracking-wide text-ink-secondary mb-1">Coverage</p>
                        {!needsCoverage && candidates.length > 0 ? (
                          <p className="mb-2 flex items-center gap-1.5 text-[var(--status-good)]">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            No coverage strictly required — you can still assign someone below.
                          </p>
                        ) : null}
                        {top ? (
                          <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-3">
                            <p className="flex items-center gap-1 text-[11px] font-medium text-brand-700">
                              <Sparkles className="h-3 w-3" />
                              Suggested coverage (ranked by suitability)
                            </p>
                            <p className="mt-1.5 text-sm font-medium text-ink">{top.employee.name}</p>
                            <p className="text-xs text-ink-secondary">
                              Current capacity {top.utilization}% → {top.projectedCapacity}% after assignment · {top.skillMatch}% skill match
                            </p>
                            {top.projectedCapacity > OVERLOAD_THRESHOLD && (
                              <p className="mt-1 flex items-start gap-1.5 font-medium text-[var(--status-critical)]">
                                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                Covering this would take {top.employee.name.split(" ")[0]} past the {OVERLOAD_THRESHOLD}% overload threshold.
                              </p>
                            )}
                            {top.skillMatch === 0 && (
                              <p className="mt-1 text-ink-muted">No skill match — ranked highest on capacity. Assign anyone below if you prefer.</p>
                            )}
                            <button
                              onClick={() => handleAssign(item, top)}
                              disabled={assignedIds.includes(top.employee.id)}
                              className="mt-2.5 rounded-lg bg-brand-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                            >
                              {assignedIds.includes(top.employee.id) ? "Assigned" : `Assign to ${top.employee.name.split(" ")[0]}`}
                            </button>
                          </div>
                        ) : (
                          <p className="flex items-center gap-1.5 text-[var(--status-critical)]">
                            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                            Everyone in the unit is on leave during this period.
                          </p>
                        )}
                      </div>

                      <div className="mt-3.5 flex items-center gap-4 border-t border-border pt-3">
                        {candidates.length > 1 && (
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
                            All employees in the unit, ranked by suitability. You can assign any of them.
                          </p>
                          <div className="space-y-2">
                            {alternates.map((c) => (
                              <CoverageCandidateRow key={c.employee.id} candidate={c} assigned={assignedIds.includes(c.employee.id)} onAssign={() => handleAssign(item, c)} />
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

          {/* Continuity Plan */}
          <Card>
            <CardHeader title="Continuity Plan" subtitle={`${impact.employee.name} · ${formatDisplayDate(impact.start)} – ${formatDisplayDate(impact.end)}`} />
            <div className="space-y-3 text-xs">
              <div>
                <p className="font-semibold uppercase tracking-wide text-ink-secondary mb-1">Before Leave</p>
                {urgentItems.length === 0 ? (
                  <p className="text-ink-muted">No action needed — this work can safely stay with {impact.employee.name}.</p>
                ) : (
                  <ul className="space-y-1">
                    {urgentItems.map((i) => {
                      const covered = !!assignments[i.id] || (impact.candidatesByItem.get(i.id) ?? []).some((c) => c.assignable);
                      return (
                        <li key={i.id} className={`flex items-start gap-1.5 ${covered ? "text-[var(--status-good)]" : "text-[var(--status-warning)]"}`}>
                          {covered ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                          {covered ? `Reassign ${i.title}` : `Review ${i.title}`}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <p className="font-semibold uppercase tracking-wide text-ink-secondary mb-1">During Leave</p>
                {primaryCandidate ? (
                  <p className="text-ink-secondary">
                    <span className="font-medium text-ink">{primaryCandidate.name}</span> will cover{" "}
                    {impact.affectedWork
                      .filter((i) => {
                        const list = impact.candidatesByItem.get(i.id) ?? [];
                        const pick = list.find((c) => c.eligible) ?? list.find((c) => c.assignable);
                        return pick?.employee.id === primaryCandidate.id;
                      })
                      .map((i) => `${i.title} (${i.remainingHours}h)`)
                      .join(", ")}
                  </p>
                ) : (
                  <p className="text-ink-muted">No coverage currently identified</p>
                )}
              </div>

              <div>
                <p className="font-semibold uppercase tracking-wide text-ink-secondary mb-1">After Return</p>
                <p className="text-ink-secondary">
                  Original ownership returns to <span className="font-medium text-ink">{impact.employee.name}</span>
                </p>
              </div>
            </div>

            {confirmed ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-3.5 py-3">
                <Award className="h-4 w-4 shrink-0 text-[var(--status-good)]" />
                <p className="text-xs font-medium text-[var(--status-good)]">
                  {confirmedCount > 0
                    ? `Handover plan confirmed — ${confirmedCount} item${confirmedCount === 1 ? "" : "s"} reassigned to the recommended coverage.`
                    : "Handover plan confirmed — recommended coverage was already assigned."}
                </p>
              </div>
            ) : anyCoverageSuggested ? (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleConfirmPlan}
                  disabled={confirming}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
                >
                  {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                  {confirming ? "Confirming…" : "Confirm Handover Plan"}
                </button>
              </div>
            ) : (
              <p className="mt-4 text-right text-xs text-ink-muted">
                No suggested coverage yet — nothing to confirm.
              </p>
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
        <Detail label="Current Capacity" value={`${candidate.utilization}%`} />
        <Detail label="After Assignment" value={`${candidate.projectedCapacity}%`} />
        <Detail label="Skill Match" value={`${candidate.skillMatch}%`} />
      </div>
      {candidate.projectedCapacity > OVERLOAD_THRESHOLD && (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-[var(--status-critical)]">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Would exceed the {OVERLOAD_THRESHOLD}% overload threshold ({candidate.projectedCapacity}%).
        </p>
      )}
      {candidate.skillMatch === 0 && (
        <p className="mt-1 text-xs text-ink-muted">No matching skill — assignable, but not a skills-based recommendation.</p>
      )}
    </div>
  );
}
