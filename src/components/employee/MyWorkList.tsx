"use client";

import { useState } from "react";
import type { Employee } from "@/data/types";
import { WorkItemRow, type WorkRow } from "@/components/work/WorkItemRow";
import { TaskDetailPanel } from "@/components/work/TaskDetailPanel";
import { useTickets, type AssignedTicket } from "@/store/tickets-store";
import { useEmployees } from "@/store/employees-store";
import { useTaskAdjustments } from "@/store/task-adjustments-store";
import { ticketEffortForEmployee } from "@/lib/capacityEngine";
import { ticketDueLabel, adhocDueLabel, seedTicketDueLabel } from "@/lib/due";

export function MyWorkList({ employee, assignedTickets }: { employee: Employee; assignedTickets: AssignedTicket[] }) {
  const {
    tickets,
    updateTicketStatus,
    updateTicketPriority,
    updateTicketSkills,
    setTicketAssignees,
    setTicketEffortSplit,
  } = useTickets();
  const { employees } = useEmployees();
  const { submit: submitAdjustment } = useTaskAdjustments();
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detailTicket = openTicketId ? tickets.find((t) => t.id === openTicketId) ?? null : null;

  const rows: WorkRow[] = [
    ...employee.upcomingTickets.map((t) => ({
      key: `${employee.id}:${t.id}`,
      title: t.title,
      type: "Ticket" as const,
      priority: t.priority,
      deadline: seedTicketDueLabel(t),
      estimatedHours: t.estimatedHours,
    })),
    ...employee.adhoc.map((a) => ({
      key: `${employee.id}:${a.id}`,
      title: a.name,
      type: "Ad-hoc" as const,
      priority: a.priority,
      deadline: adhocDueLabel(a),
      estimatedHours: a.estimatedHours,
    })),
    ...assignedTickets.map((t) => ({
      key: `${employee.id}:${t.id}`,
      title: t.assignedEmployeeIds && t.assignedEmployeeIds.length > 1 ? `${t.title} (${t.id}) — shared` : `${t.title} (${t.id})`,
      type: "Ticket" as const,
      priority: t.priority,
      deadline: ticketDueLabel(t),
      estimatedHours: ticketEffortForEmployee(t, employee.id),
      ticketId: t.id,
      ticketStatus: t.status,
    })),
  ];

  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted py-4">No active assignments.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs font-medium text-[var(--status-critical)]">{error}</p>}
      {rows.map((row) => (
        <WorkItemRow
          key={row.key}
          row={row}
          currentUserName={employee.name}
          onUpdateTicketStatus={(id, status) => updateTicketStatus(id, status).catch(() => {})}
          onOpenDetails={row.ticketId ? (id) => setOpenTicketId(id) : undefined}
        />
      ))}

      {detailTicket && (
        <TaskDetailPanel
          key={detailTicket.id}
          ticket={detailTicket}
          employees={employees.filter((e) => e.department === employee.department && e.level !== "Supervisor")}
          currentUserName={employee.name}
          currentEmployeeId={employee.id}
          onClose={() => setOpenTicketId(null)}
          onUpdateStatus={(status) => updateTicketStatus(detailTicket.id, status).catch(() => setError("Couldn't update status — check your connection."))}
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
