"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PriorityBadge } from "@/components/ui/StatusBadge";
import type { WorkflowStatus } from "@/data/types";
import { TICKET_STATUS_OPTIONS, type TicketStatus } from "@/data/tickets";
import { getDueStatus, type DueStatus } from "@/lib/date";
import { useWorkLog } from "@/store/work-log-store";
import { CommentsThread } from "@/components/work/CommentsThread";

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
  onUpdateTicketStatus?: (ticketId: string, status: TicketStatus) => void;
  /** When set (and this row is backed by a live ticket), shows a "Details" button
   * that opens the full task detail panel. */
  onOpenDetails?: (ticketId: string) => void;
}) {
  const { getEntry, setWorkflowStatus, setProgress } = useWorkLog();
  const entry = getEntry(row.key);
  const [expanded, setExpanded] = useState(false);

  const due = getDueStatus(row.deadline);
  const isTicket = row.ticketId !== undefined && row.ticketStatus !== undefined;
  const workflowStatus = entry.workflowStatus ?? "In Progress";
  const complete = isTicket ? row.ticketStatus === "Completed" : workflowStatus === "Completed";
  const progress = entry.progress ?? 0;
  const remainingHours = complete ? 0 : Math.round(row.estimatedHours * (1 - progress / 100) * 10) / 10;

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
            <span>Due: {row.deadline}</span>
            <span className="tabular">{remainingHours}h remaining</span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${DUE_STYLES[due]}`}>
              {due}
            </span>
            {!complete && <span className="tabular text-ink-muted">{progress}% done</span>}
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
          {isTicket ? (
            <select
              value={row.ticketStatus}
              onChange={(e) => onUpdateTicketStatus?.(row.ticketId!, e.target.value as TicketStatus)}
              className="input max-w-[150px]"
            >
              {TICKET_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={workflowStatus}
              onChange={(e) => setWorkflowStatus(row.key, e.target.value as WorkflowStatus).catch(() => {})}
              className="input max-w-[150px]"
            >
              {WORKFLOW_OPTIONS.map((s) => (
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
    </div>
  );
}
