"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import type { Employee } from "@/data/types";
import { WorkItemRow, type WorkRow } from "@/components/work/WorkItemRow";
import { TaskDetailPanel } from "@/components/work/TaskDetailPanel";
import { useTickets, type AssignedTicket } from "@/store/tickets-store";
import { useEmployees } from "@/store/employees-store";
import { useWorkLog } from "@/store/work-log-store";
import { useTaskAdjustments } from "@/store/task-adjustments-store";
import { ticketEffortForEmployee } from "@/lib/capacityEngine";
import { ticketDueLabel, adhocDueLabel, seedTicketDueLabel } from "@/lib/due";

export function MyWorkList({
  employee,
  assignedTickets,
  section = "active",
}: {
  employee: Employee;
  assignedTickets: AssignedTicket[];
  /** "active" → In Progress / On Hold / Overdue rows (editable). "completed" → the
   * read-only Completed Tasks list. */
  section?: "active" | "completed";
}) {
  const {
    tickets,
    updateTicketStatus,
    updateTicketPriority,
    updateTicketSkills,
    setTicketAssignees,
    setTicketEffortSplit,
  } = useTickets();
  const { employees } = useEmployees();
  const { getEntry } = useWorkLog();
  const { submit: submitAdjustment } = useTaskAdjustments();
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detailTicket = openTicketId ? tickets.find((t) => t.id === openTicketId) ?? null : null;

  const isComplete = (key: string, ticketStatus?: string) =>
    ticketStatus === "Completed" || getEntry(key).workflowStatus === "Completed";

  const allRows: (WorkRow & { completed: boolean; completedDate: string | null })[] = [
    ...employee.upcomingTickets.map((t) => {
      const key = `${employee.id}:${t.id}`;
      return {
        key,
        title: t.title,
        type: "Ticket" as const,
        priority: t.priority,
        deadline: seedTicketDueLabel(t),
        estimatedHours: t.estimatedHours,
        completed: isComplete(key),
        completedDate: getEntry(key).completedAt ?? null,
      };
    }),
    ...employee.adhoc.map((a) => {
      const key = `${employee.id}:${a.id}`;
      return {
        key,
        title: a.name,
        type: "Ad-hoc" as const,
        priority: a.priority,
        deadline: adhocDueLabel(a),
        estimatedHours: a.estimatedHours,
        completed: isComplete(key),
        completedDate: getEntry(key).completedAt ?? null,
      };
    }),
    ...assignedTickets.map((t) => {
      const key = `${employee.id}:${t.id}`;
      return {
        key,
        title: t.assignedEmployeeIds && t.assignedEmployeeIds.length > 1 ? `${t.title} (${t.id}) — shared` : `${t.title} (${t.id})`,
        type: "Ticket" as const,
        priority: t.priority,
        deadline: ticketDueLabel(t),
        estimatedHours: ticketEffortForEmployee(t, employee.id),
        ticketId: t.id,
        ticketStatus: t.status,
        ticketResolvedDate: t.resolvedDate,
        ticketHoldStart: t.holdStartDate ?? null,
        ticketHoldEnd: t.holdEndDate ?? null,
        completed: isComplete(key, t.status),
        completedDate: t.resolvedDate ?? getEntry(key).completedAt ?? null,
      };
    }),
  ];

  const activeRows = allRows.filter((r) => !r.completed);
  const completedRows = allRows.filter((r) => r.completed);

  if (section === "completed") {
    if (completedRows.length === 0) {
      return <p className="text-sm text-ink-muted py-4">No completed tasks yet.</p>;
    }
    return (
      <ul className="divide-y divide-border">
        {completedRows.map((row) => (
          <li key={row.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{row.title}</p>
              <p className="text-xs text-ink-muted mt-0.5">
                {row.type}
                {row.completedDate ? ` · completed ${row.completedDate}` : ""}
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--status-good)]">
              <CheckCircle2 className="h-3 w-3" />
              Completed
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs font-medium text-[var(--status-critical)]">{error}</p>}

      {activeRows.length === 0 ? (
        <p className="text-sm text-ink-muted py-4">No active assignments.</p>
      ) : (
        activeRows.map((row) => (
          <WorkItemRow
            key={row.key}
            row={row}
            currentUserName={employee.name}
            onUpdateTicketStatus={(id, status, hold) => updateTicketStatus(id, status, hold).catch(() => {})}
            onOpenDetails={row.ticketId ? (id) => setOpenTicketId(id) : undefined}
          />
        ))
      )}

      {detailTicket && (
        <TaskDetailPanel
          key={detailTicket.id}
          ticket={detailTicket}
          employees={employees.filter((e) => e.department === employee.department && e.level !== "Supervisor")}
          currentUserName={employee.name}
          currentEmployeeId={employee.id}
          onClose={() => setOpenTicketId(null)}
          onUpdateStatus={(status, hold) => updateTicketStatus(detailTicket.id, status, hold).catch(() => setError("Couldn't update status — check your connection."))}
          onUpdatePriority={(priority) => updateTicketPriority(detailTicket.id, priority).catch(() => setError("Couldn't update priority — check your connection."))}
          onUpdateSkills={(skills) => updateTicketSkills(detailTicket.id, skills).catch(() => setError("Couldn't update skills — check your connection."))}
          onUpdateAssignees={(ids, split) => setTicketAssignees(detailTicket.id, ids, split).catch(() => setError("Couldn't update assignees — check your connection."))}
          onUpdateEffortSplit={(split) => setTicketEffortSplit(detailTicket.id, split).catch(() => setError("Couldn't update the effort split — check your connection."))}
          onRequestAdjustment={(draft) =>
            submitAdjustment({
              ticketId: detailTicket.id,
              employeeId: employee.id,
              kind: draft.kind,
              requestedDeadline: draft.requestedDeadline,
              requestedHours: draft.requestedHours,
              justification: draft.justification,
            })
          }
        />
      )}
    </div>
  );
}
