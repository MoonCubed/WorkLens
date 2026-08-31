"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { CommentsThread } from "@/components/work/CommentsThread";
import { SkillSelect } from "@/components/skills/SkillSelect";
import type { AssignedTicket } from "@/store/tickets-store";
import type { Employee } from "@/data/types";
import { TICKET_STATUS_OPTIONS, type TicketStatus, type TicketPriority } from "@/data/tickets";
import { slaWindowLabel, isSlaDerived, toInputDateValue, formatDisplayDate } from "@/lib/date";
import { ticketDueLabel } from "@/lib/due";
import { ticketEffortForEmployee } from "@/lib/capacityEngine";
import type { AdjustmentKind } from "@/store/task-adjustments-store";

const PRIORITY_OPTIONS: TicketPriority[] = ["High", "Medium", "Low"];
const MAX_ASSIGNEES = 2;

export interface AdjustmentDraft {
  kind: AdjustmentKind;
  requestedDeadline?: string | null;
  requestedHours?: number | null;
  justification: string;
}

/** Full ticket detail — description, editable status/priority, skills, co-assignees
 * with an effort split, the shared comment thread, and (in an employee's own view) a
 * form to request an adjustment. Used from the supervisor's Tasks page, the calendars,
 * and the employee dashboard, so clicking a task anywhere opens the same panel. */
export function TaskDetailPanel({
  ticket,
  employees,
  currentUserName,
  currentEmployeeId,
  assigneeEditing = true,
  onClose,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateSkills,
  onUpdateAssignees,
  onUpdateEffortSplit,
  onRequestAdjustment,
}: {
  ticket: AssignedTicket;
  employees: Employee[];
  currentUserName: string;
  /** When set, the panel is an employee's own view — shows the "request an adjustment" form. */
  currentEmployeeId?: string;
  /** Whether the panel lets you add/remove assignees and edit the effort split. The
   * supervisor's Tasks page turns this off — assignment there happens via Suggested
   * Candidates, so the panel only shows who is assigned. Defaults to true. */
  assigneeEditing?: boolean;
  onClose: () => void;
  onUpdateStatus: (status: TicketStatus) => void;
  onUpdatePriority: (priority: TicketPriority) => void;
  onUpdateSkills: (skills: string[]) => void;
  onUpdateAssignees: (employeeIds: string[], effortSplit?: Record<string, number>) => void;
  onUpdateEffortSplit?: (effortSplit: Record<string, number>) => void;
  onRequestAdjustment?: (draft: AdjustmentDraft) => Promise<void>;
}) {
  const assigneeIds = ticket.assignedEmployeeIds ?? [];
  const assignees = assigneeIds
    .map((id) => employees.find((e) => e.id === id))
    .filter((e): e is Employee => !!e);
  const availableToAdd = employees.filter((e) => !assigneeIds.includes(e.id));

  const [skillDraft, setSkillDraft] = useState("");
  const [addAssigneeId, setAddAssigneeId] = useState("");
  const [splitHours, setSplitHours] = useState<number>(() =>
    assigneeIds.length === 2 ? ticketEffortForEmployee(ticket, assigneeIds[0]) : 0
  );
  const skills = ticket.relatedSkills ?? [];

  const dueLabel = ticketDueLabel(ticket);
  const slaDerived = isSlaDerived(ticket.expectedResolutionDate);

  function addSkill() {
    const name = skillDraft.trim();
    if (!name || skills.some((s) => s.toLowerCase() === name.toLowerCase())) {
      setSkillDraft("");
      return;
    }
    onUpdateSkills([...skills, name]);
    setSkillDraft("");
  }

  function removeSkill(name: string) {
    onUpdateSkills(skills.filter((s) => s !== name));
  }

  function addAssignee() {
    if (!addAssigneeId || assigneeIds.length >= MAX_ASSIGNEES) return;
    onUpdateAssignees([...assigneeIds, addAssigneeId]);
    setAddAssigneeId("");
  }

  function removeAssignee(id: string) {
    onUpdateAssignees(assigneeIds.filter((a) => a !== id));
  }

  function saveSplit() {
    if (assigneeIds.length !== 2 || !onUpdateEffortSplit) return;
    const a = Math.max(0, Math.min(ticket.estimatedHours, Math.round(splitHours * 10) / 10));
    onUpdateEffortSplit({
      [assigneeIds[0]]: a,
      [assigneeIds[1]]: Math.round((ticket.estimatedHours - a) * 10) / 10,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-8" onClick={onClose}>
      <div
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{ticket.id}</p>
            <h2 className="mt-0.5 text-lg font-semibold text-ink">{ticket.title}</h2>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="flex items-center gap-2 text-xs">
            <span className="font-medium uppercase tracking-wide text-ink-secondary">Status</span>
            <select
              value={ticket.status}
              onChange={(e) => onUpdateStatus(e.target.value as TicketStatus)}
              className="input max-w-[160px]"
            >
              {TICKET_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <span className="font-medium uppercase tracking-wide text-ink-secondary">Priority</span>
            <select
              value={ticket.priority}
              onChange={(e) => onUpdatePriority(e.target.value as TicketPriority)}
              className="input max-w-[140px]"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-lg border border-border bg-brand-50/40 p-3.5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-secondary">Description:</p>
          <p className="mt-1 text-sm text-ink-secondary leading-relaxed">{ticket.description}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-brand-50/40 p-3.5 text-xs sm:grid-cols-4">
          <Detail label="Raised" value={ticket.raisedDate} />
          <Detail label="Estimated" value={`${ticket.estimatedHours}h`} />
          <Detail label="SLA" value={slaWindowLabel(ticket.priority)} />
          <Detail label="Due" value={slaDerived ? `${dueLabel} (SLA)` : dueLabel} />
          <Detail label="Assigned Unit" value={ticket.assignedUnit} />
          <Detail label="Created By" value={ticket.createdBy} />
          <Detail label="Assigned By" value={ticket.assignedBy} />
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-ink">Assigned To</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {assignees.length === 0 && <p className="text-sm text-ink-muted">Unassigned</p>}
            {assignees.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 pl-2.5 pr-1.5 py-1 text-xs font-medium text-brand-800"
              >
                {e.name}
                {assigneeIds.length === 2 && (
                  <span className="text-brand-500">· {ticketEffortForEmployee(ticket, e.id)}h</span>
                )}
                {assigneeEditing && assigneeIds.length === 2 && (
                  <button
                    onClick={() => removeAssignee(e.id)}
                    className="rounded-full p-0.5 text-brand-500 hover:bg-brand-100 hover:text-brand-800"
                    aria-label={`Remove ${e.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>

          {assigneeEditing && assigneeIds.length < MAX_ASSIGNEES && availableToAdd.length > 0 && (
            <div className="mt-2.5 flex items-center gap-2">
              <select value={addAssigneeId} onChange={(e) => setAddAssigneeId(e.target.value)} className="input max-w-[220px]">
                <option value="">{assigneeIds.length === 0 ? "Assign to…" : "Add a co-assignee…"}</option>
                {availableToAdd.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button
                onClick={addAssignee}
                disabled={!addAssigneeId}
                className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-brand-50 disabled:opacity-50"
              >
                {assigneeIds.length === 0 ? "Assign" : "Add"}
              </button>
            </div>
          )}

          {assigneeEditing && assigneeIds.length === 2 && onUpdateEffortSplit && (
            <div className="mt-3 rounded-lg border border-border bg-brand-50/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-secondary">Effort split</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ink-secondary">{assignees[0]?.name ?? assigneeIds[0]}</span>
                <input
                  type="number"
                  min={0}
                  max={ticket.estimatedHours}
                  step={0.5}
                  value={splitHours}
                  onChange={(e) => setSplitHours(Number(e.target.value) || 0)}
                  className="input w-20 py-1 text-xs"
                />
                <span className="text-ink-muted">
                  h · {assignees[1]?.name ?? assigneeIds[1]}{" "}
                  {Math.max(0, Math.round((ticket.estimatedHours - splitHours) * 10) / 10)}h
                </span>
                <button
                  onClick={saveSplit}
                  className="rounded-lg border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-brand-50"
                >
                  Save split
                </button>
              </div>
              <p className="mt-1.5 text-xs text-ink-muted">
                Splits the {ticket.estimatedHours}h estimate — both people&rsquo;s capacity updates to match.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-ink">Skills</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {skills.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 pl-2.5 pr-1.5 py-1 text-xs font-medium text-brand-800"
              >
                {s}
                <button
                  onClick={() => removeSkill(s)}
                  className="rounded-full p-0.5 text-brand-500 hover:bg-brand-100 hover:text-brand-800"
                  aria-label={`Remove ${s}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <SkillSelect
              value={skillDraft}
              onChange={setSkillDraft}
              exclude={skills}
              placeholder="Add a skill…"
              className="input max-w-[180px] py-1.5 text-xs"
              aria-label="Add a skill"
            />
            <button
              onClick={addSkill}
              className="rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-brand-50"
            >
              Add
            </button>
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">Used to suggest candidates for this ticket.</p>
        </div>

        {currentEmployeeId && onRequestAdjustment && (
          <AdjustmentRequestForm ticket={ticket} onSubmit={onRequestAdjustment} />
        )}

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-ink">Comments</h3>
          {assigneeIds.length > 0 ? (
            <CommentsThread workLogKey={`${assigneeIds[0]}:${ticket.id}`} currentUserName={currentUserName} />
          ) : (
            <p className="text-xs text-ink-muted">Assign this ticket to an employee to start a comment thread.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const KIND_LABELS: Record<AdjustmentKind, string> = {
  deadline: "Extend the deadline",
  effort: "Adjust estimated effort",
  reassignment: "Request a change to the assignment",
  other: "Other adjustment",
};

function AdjustmentRequestForm({
  ticket,
  onSubmit,
}: {
  ticket: AssignedTicket;
  onSubmit: (draft: AdjustmentDraft) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AdjustmentKind>("deadline");
  const [deadline, setDeadline] = useState(() => toInputDateValue(ticketDueLabel(ticket)));
  const [hours, setHours] = useState(ticket.estimatedHours);
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!justification.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        kind,
        requestedDeadline:
          kind === "deadline" && deadline ? formatDisplayDate(new Date(`${deadline}T00:00:00`)) : null,
        requestedHours: kind === "effort" ? hours : null,
        justification: justification.trim(),
      });
      setDone(true);
      setJustification("");
    } catch {
      setError("Couldn't send this request — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-border p-3.5">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setDone(false);
        }}
        className="text-sm font-semibold text-ink"
      >
        Request an adjustment {open ? "−" : "+"}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {done ? (
            <p className="rounded-lg border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-3 py-2 text-xs text-[var(--status-good)]">
              Sent to your supervisor for review. The task hasn&rsquo;t changed yet.
            </p>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-secondary">What do you need?</span>
                <select value={kind} onChange={(e) => setKind(e.target.value as AdjustmentKind)} className="input">
                  {(Object.keys(KIND_LABELS) as AdjustmentKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>

              {kind === "deadline" && (
                <div className="text-xs">
                  <p className="text-ink-muted">Current deadline: {ticketDueLabel(ticket)}</p>
                  <label className="mt-1 block">
                    <span className="mb-1 block font-medium uppercase tracking-wide text-ink-secondary">Requested deadline</span>
                    <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="input" />
                  </label>
                </div>
              )}

              {kind === "effort" && (
                <div className="text-xs">
                  <p className="text-ink-muted">Current estimate: {ticket.estimatedHours}h</p>
                  <label className="mt-1 block">
                    <span className="mb-1 block font-medium uppercase tracking-wide text-ink-secondary">Requested estimate (hours)</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={hours}
                      onChange={(e) => setHours(Number(e.target.value) || 0)}
                      className="input"
                    />
                  </label>
                </div>
              )}

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Justification</span>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  rows={3}
                  placeholder="Explain why this adjustment is needed…"
                  className="input resize-none"
                />
              </label>

              {error && <p className="text-xs font-medium text-[var(--status-critical)]">{error}</p>}

              <button
                onClick={submit}
                disabled={busy || !justification.trim()}
                className="rounded-lg bg-brand-800 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send request"}
              </button>
            </>
          )}
        </div>
      )}
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
