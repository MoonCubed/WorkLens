"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CalendarCheck2, PauseCircle, Lock, PlayCircle } from "lucide-react";
import { PriorityBadge } from "@/components/ui/StatusBadge";
import type { WorkflowStatus } from "@/data/types";
import { TICKET_STATUS_OPTIONS, type TicketStatus } from "@/data/tickets";
import { getDueStatus, type DueStatus } from "@/lib/date";
import { unifiedItemStatus } from "@/lib/capacityEngine";
import { useWorkLog } from "@/store/work-log-store";
import { CommentsThread } from "@/components/work/CommentsThread";
import { StatusChangeDialog, type HoldDates } from "@/components/work/StatusChangeDialog";

const WORKFLOW_OPTIONS: WorkflowStatus[] = ["In Progress", "On Hold", "Completed"];

const DUE_STYLES: Record<DueStatus, string> = {
  Overdue: "bg-[var(--status-critical-bg)] border-[var(--status-critical-border)] text-[var(--status-critical)]",
  "Due Soon": "bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning)]",
  "On Track": "bg-[var(--status-good-bg)] border-[var(--status-good-border)] text-[var(--status-good)]",
};

export interface WorkRow {
  key: string;
  title: string;
  type: "Ticket" | "Ad-hoc";
  priority: "High" | "Medium" | "Low";
  deadline: string;
  estimatedHours: number;
  /** Present only for rows backed by a live ticket. When set, status is edited on the
   * ticket itself (one shared field) instead of this row's personal work-log status —
   * a ticket can be co-assigned to 2 people, so either of them changing it needs to
   * reflect for both, not just whoever clicked. */
  ticketId?: string;
  ticketStatus?: TicketStatus;
  /** For a live-ticket row: the ticket's completion date + hold window, so a
   * completed/held row shows those instead of the due-status chip. */
  ticketResolvedDate?: string | null;
  ticketHoldStart?: string | null;
  ticketHoldEnd?: string | null;
}

/** A single task row — click to expand into progress and the comment thread, backed by
 * the shared work-log store keyed by "<employeeId>:<itemId>", so an employee's own view
 * and their supervisor's view of the same task always show the same live state.
 * `currentUserName` attributes any comment added from this row. */
export function WorkItemRow({
  row,
  currentUserName,
  onUpdateTicketStatus,
  onOpenDetails,
}: {
  row: WorkRow;
  currentUserName: string;
  onUpdateTicketStatus?: (ticketId: string, status: TicketStatus, hold?: HoldDates) => void;
  /** When set (and this row is backed by a live ticket), shows a "Details" button
   * that opens the full task detail panel. */
  onOpenDetails?: (ticketId: string) => void;
}) {
  const { getEntry, setWorkflowStatus, setProgress } = useWorkLog();
  const entry = getEntry(row.key);
  const [expanded, setExpanded] = useState(false);
  // A move into Completed / On Hold is confirmed first (see StatusChangeDialog).
  const [pending, setPending] = useState<"Completed" | "On Hold" | null>(null);

  const due = getDueStatus(row.deadline);
  const isTicket = row.ticketId !== undefined && row.ticketStatus !== undefined;
  const workflowStatus = entry.workflowStatus ?? "In Progress";
  // For a ticket the ticket's own status is authoritative; for a stand-alone row it's
  // the personal work-log status. Resolved through the same `unifiedItemStatus` the
  // dashboard, calendar and capacity use, so this row can never disagree with them.
  const holdStart = isTicket ? (row.ticketHoldStart ?? null) : entry.holdStartDate ?? null;
  const holdEnd = isTicket ? (row.ticketHoldEnd ?? null) : entry.holdEndDate ?? null;
  const rawStatus = isTicket ? row.ticketStatus : entry.workflowStatus;
  const effectiveStatus = unifiedItemStatus(
    isTicket ? undefined : entry.workflowStatus,
    isTicket ? row.ticketStatus : undefined,
    holdEnd
  );
  const complete = effectiveStatus === "Completed";
  const onHold = effectiveStatus === "On Hold";
  // Stored status is On Hold but the hold window has passed → scheduled as active again.
  const resumedFromHold = rawStatus === "On Hold" && effectiveStatus === "In Progress";
  const completedDate = isTicket ? (row.ticketResolvedDate ?? entry.completedAt ?? null) : entry.completedAt ?? null;
  const progress = entry.progress ?? 0;
  const remainingHours = complete ? 0 : Math.round(row.estimatedHours * (1 - progress / 100) * 10) / 10;

  /** Route a status change: Completed / On Hold pause for confirmation, others apply now. */
  function requestStatus(next: WorkflowStatus | TicketStatus) {
    if (next === "Completed" || next === "On Hold") {
      setPending(next);
      return;
    }
    applyStatus(next);
  }

  function applyStatus(next: WorkflowStatus | TicketStatus, hold?: HoldDates) {
    if (isTicket) onUpdateTicketStatus?.(row.ticketId!, next as TicketStatus, hold);
    else setWorkflowStatus(row.key, next as WorkflowStatus, hold).catch(() => {});
    setPending(null);
  }

  return (
    <div className="rounded-lg border border-border">
      <div
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        className="flex w-full flex-wrap items-center justify-between gap-3 p-4 cursor-pointer outline-none"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-ink">{row.title}</p>
            <span className="text-[11px] text-ink-muted">{row.type}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-secondary">
            {complete ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--status-good)]">
                  <CalendarCheck2 className="h-3 w-3" />
                  Completed{completedDate ? ` · ${completedDate}` : ""}
                </span>
              </>
            ) : (
              <>
                <span>Due: {row.deadline}</span>
                <span className="tabular">{remainingHours}h remaining</span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${DUE_STYLES[due]}`}>
                  {due}
                </span>
                <span className="tabular text-ink-muted">{progress}% done</span>
                {onHold && (holdStart || holdEnd) && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border-strong bg-brand-50/60 px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
                    <PauseCircle className="h-3 w-3" />
                    On hold {holdStart ?? "?"} – {holdEnd ?? "?"}
                  </span>
                )}
                {resumedFromHold && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-brand-100 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700"
                    title={`Hold ended ${holdEnd ?? ""} — the remaining effort is re-spread across the working days left before the deadline.`}
                  >
                    <PlayCircle className="h-3 w-3" />
                    Resumed after hold
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <PriorityBadge priority={row.priority} />
          {isTicket && onOpenDetails && (
            <button
              type="button"
              onClick={() => onOpenDetails(row.ticketId!)}
              className="rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-xs font-medium text-ink hover:bg-brand-50"
            >
              Details
            </button>
          )}
          {complete ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-2.5 py-2 text-xs font-medium text-[var(--status-good)]"
              title="A completed task is locked and can't be reopened."
            >
              <Lock className="h-3.5 w-3.5" />
              Completed
            </span>
          ) : (
            <select
              value={isTicket ? row.ticketStatus : workflowStatus}
              onChange={(e) => requestStatus(e.target.value as WorkflowStatus)}
              className="input max-w-[150px]"
            >
              {(isTicket ? TICKET_STATUS_OPTIONS : WORKFLOW_OPTIONS).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-border-strong bg-surface p-2 text-ink-muted hover:bg-brand-50"
            aria-label="Toggle details and comments"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-brand-50/30 p-4">
          {!complete && (
            <div className="mb-4">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium uppercase tracking-wide text-ink-secondary">Progress</span>
                <span className="tabular font-medium text-ink">{progress}% · {remainingHours}h remaining of {row.estimatedHours}h</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => setProgress(row.key, Number(e.target.value)).catch(() => {})}
                className="w-full accent-brand-700"
              />
              {isTicket && <p className="mt-1 text-xs text-ink-muted">Your own progress on this ticket — shared with anyone else assigned to it.</p>}
            </div>
          )}
          <CommentsThread workLogKey={row.key} currentUserName={currentUserName} />
        </div>
      )}

      {pending && (
        <StatusChangeDialog
          target={pending}
          itemTitle={row.title}
          onCancel={() => setPending(null)}
          onConfirm={(hold) => applyStatus(pending, hold)}
        />
      )}
    </div>
  );
}
