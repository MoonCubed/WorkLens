"use client";

import { useMemo, useState } from "react";
import { CalendarView, type CalendarItem, type TicketDeadlineState } from "@/components/calendar/CalendarView";
import { TaskDetailPanel } from "@/components/work/TaskDetailPanel";
import { useSupervisorSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";
import { useTickets, ticketsForUnit, type AssignedTicket } from "@/store/tickets-store";
import { useCalendarEvents } from "@/store/calendar-events-store";
import { getDepartmentSupervisor, getUnitTeam } from "@/lib/hr";
import { parseLooseDate, getDueStatus } from "@/lib/date";
import { ticketDueLabel } from "@/lib/due";

function ticketDeadlineState(t: AssignedTicket): TicketDeadlineState {
  if (t.status === "Completed") return "closed";
  return getDueStatus(ticketDueLabel(t)) === "Overdue" ? "overdue" : "open";
}

export default function SupervisorCalendarPage() {
  const { unit } = useSupervisorSession();
  const { employees } = useEmployees();
  const { tickets, updateTicketStatus, updateTicketPriority, updateTicketSkills, setTicketAssignees, setTicketEffortSplit } = useTickets();
  const { events, addEvent } = useCalendarEvents();
  const unitEmployees = useMemo(() => getUnitTeam(unit, employees), [employees, unit]);
  const currentSupervisor = getDepartmentSupervisor(unit, employees);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const unitTickets = useMemo(() => ticketsForUnit(tickets, unit), [tickets, unit]);
  const detailTicket = openTicketId ? unitTickets.find((t) => t.id === openTicketId) ?? null : null;
  const currentUserName = currentSupervisor?.name ?? "Supervisor";

  const items = useMemo(() => {
    const list: CalendarItem[] = [];

    // Every ticket assigned to this unit, live from the IT Ticket System — not just
    // ones already routed to an employee, so nothing waiting in the queue is missed.
    unitTickets.forEach((t) => {
      const date = parseLooseDate(ticketDueLabel(t));
      if (!date) return;
      const owners = unitEmployees.filter((e) => (t.assignedEmployeeIds ?? []).includes(e.id));
      list.push({
        key: `t-${t.id}`,
        label: `${t.title} (${t.id})`,
        sublabel: owners.length > 0 ? owners.map((o) => o.name).join(", ") : "Unassigned",
        kind: "Ticket",
        date,
        priority: t.priority,
        status: t.status,
        ticketState: ticketDeadlineState(t),
        onClick: () => setOpenTicketId(t.id),
      });
    });

    unitEmployees.forEach((e) => {
      const first = e.name.split(" ")[0];
      e.leaveEvents.forEach((l) => {
        const start = parseLooseDate(l.start);
        const end = parseLooseDate(l.end);
        if (!start || !end) return;
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          list.push({
            key: `l-${l.id}-${e.id}-${d.getTime()}`,
            label: `${l.type} (${first})`,
            sublabel: e.name,
            kind: "Leave",
            date: new Date(d),
          });
        }
      });
    });

    if (currentSupervisor) {
      events
        .filter((ev) => ev.authorId === currentSupervisor.id && ev.department === unit)
        .forEach((ev) => {
          const date = parseLooseDate(ev.date);
          if (!date) return;
          list.push({
            key: ev.id,
            label: ev.title,
            sublabel: "You",
            kind: "Custom",
            date,
            priority: ev.priority,
            itemType: ev.itemType,
            note: ev.note,
          });
        });
    }

    return list;
  }, [unitEmployees, unitTickets, unit, events, currentSupervisor]);

  return (
    <>
      <CalendarView
        title="Calendar"
        subtitle={`${unit} · deadlines and leave, day by day.`}
        items={items}
        onAddItem={
          currentSupervisor
            ? async (input) => {
                await addEvent({
                  authorId: currentSupervisor.id,
                  authorName: currentSupervisor.name,
                  authorRole: "supervisor",
                  department: unit,
                  title: input.title,
                  date: input.date,
                  priority: input.priority,
                  itemType: input.itemType,
                  note: input.note,
                });
              }
            : undefined
        }
      />

      {detailError && (
        <p className="mt-4 rounded-lg border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical)]">
          {detailError}
        </p>
      )}

      {detailTicket && (
        <TaskDetailPanel
          key={detailTicket.id}
          ticket={detailTicket}
          employees={unitEmployees}
          currentUserName={currentUserName}
          onClose={() => setOpenTicketId(null)}
          onUpdateStatus={(status) => updateTicketStatus(detailTicket.id, status).catch(() => setDetailError("Couldn't update status — check your connection and try again."))}
          onUpdatePriority={(priority) => updateTicketPriority(detailTicket.id, priority).catch(() => setDetailError("Couldn't update priority — check your connection and try again."))}
          onUpdateSkills={(skills) => updateTicketSkills(detailTicket.id, skills).catch(() => setDetailError("Couldn't update skills — check your connection and try again."))}
          onUpdateAssignees={(ids, split) => setTicketAssignees(detailTicket.id, ids, split).catch(() => setDetailError("Couldn't update assignees — check your connection and try again."))}
          onUpdateEffortSplit={(split) => setTicketEffortSplit(detailTicket.id, split).catch(() => setDetailError("Couldn't update the effort split — check your connection and try again."))}
        />
      )}
    </>
  );
}
