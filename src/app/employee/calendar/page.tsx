"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarRange, LayoutGrid } from "lucide-react";
import { CalendarView, type CalendarItem, type TicketDeadlineState } from "@/components/calendar/CalendarView";
import { WorkloadView } from "@/components/calendar/WorkloadView";
import { AppointmentsManager } from "@/components/employee/AppointmentsManager";
import { TaskDetailPanel } from "@/components/work/TaskDetailPanel";
import { useEmployeeSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";
import { useTickets, type AssignedTicket } from "@/store/tickets-store";
import { useCalendarEvents, isTimedEvent } from "@/store/calendar-events-store";
import { useTaskAdjustments } from "@/store/task-adjustments-store";
import { useWorkLog } from "@/store/work-log-store";
import { parseLooseDate, getDueStatus, todayStart, dateFromKey } from "@/lib/date";
import { ticketDueLabel } from "@/lib/due";
import { computeEmployeeSchedule } from "@/lib/capacityEngine";

function ticketDeadlineState(t: AssignedTicket): TicketDeadlineState {
  if (t.status === "Completed") return "closed";
  return getDueStatus(ticketDueLabel(t)) === "Overdue" ? "overdue" : "open";
}

export default function EmployeeCalendarPage() {
  const { employeeId } = useEmployeeSession();
  const { employees } = useEmployees();
  const me = employees.find((e) => e.id === employeeId) ?? employees[0];
  const { tickets, updateTicketStatus, updateTicketPriority, updateTicketSkills, setTicketAssignees, setTicketEffortSplit } = useTickets();
  const { events, addEvent } = useCalendarEvents();
  const { submit: submitAdjustment } = useTaskAdjustments();
  const { getEntry } = useWorkLog();
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [view, setView] = useState<"calendar" | "workload">("calendar");

  const myTickets = useMemo(() => tickets.filter((t) => (t.assignedEmployeeIds ?? []).includes(me.id)), [tickets, me]);
  const detailTicket = openTicketId ? myTickets.find((t) => t.id === openTicketId) ?? null : null;

  const items = useMemo(() => {
    const list: CalendarItem[] = [];

    // Planned daily work — each task's estimated effort spread evenly across the
    // working days until its deadline (the same schedule the capacity numbers use).
    const schedule = computeEmployeeSchedule(me, tickets, getEntry, events);
    schedule.planForRange(todayStart(), 40).forEach((plan) => {
      if (plan.allocations.length === 0) return;
      const breakdown = plan.allocations
        .slice()
        .sort((a, b) => b.hours - a.hours)
        .map((a) => `${a.item.title} — ${Math.round(a.hours * 10) / 10}h`)
        .join("\n");
      list.push({
        key: `plan-${plan.key}`,
        label: `Planned: ${plan.totalHours}h`,
        sublabel: `${plan.allocations.length} task${plan.allocations.length === 1 ? "" : "s"}`,
        kind: "Planned",
        date: dateFromKey(plan.key),
        note: breakdown,
      });
    });

    myTickets.forEach((t) => {
      const date = parseLooseDate(ticketDueLabel(t));
      if (!date) return;
      list.push({
        key: `t-${t.id}`,
        label: `${t.title} (${t.id})`,
        sublabel: "IT-Demand ticket · assigned to you",
        kind: "Ticket",
        date,
        priority: t.priority,
        status: t.status,
        ticketState: ticketDeadlineState(t),
        onClick: () => setOpenTicketId(t.id),
      });
    });

    // Ad-hoc work — a distinct colour from tickets and project/planned work.
    me.adhoc.forEach((a) => {
      const date = a.deadline === "Ongoing" ? null : parseLooseDate(a.deadline);
      if (!date) return;
      list.push({
        key: `a-${a.id}`,
        label: a.name,
        sublabel: "Ad-hoc work",
        kind: "Adhoc",
        date,
        priority: a.priority,
        itemType: "Ad-hoc",
      });
    });

    // Turnover coverage this employee is providing — one marker on the last covered day.
    schedule.items
      .filter((s) => s.isCoverage && s.workingDayKeys.length > 0)
      .forEach((s) => {
        const keys = [...s.workingDayKeys].sort();
        list.push({
          key: `cov-${s.key}`,
          label: `Covering: ${s.title}`,
          sublabel: `for ${s.coverageOwnerName ?? "a teammate"} · ${s.remainingHours}h`,
          kind: "Coverage",
          date: dateFromKey(keys[keys.length - 1]),
          note: `Covering ${s.coverageOwnerName ?? "a teammate"}'s task while they're on leave — ${s.dailyHours}h/day, ${keys.length} day${keys.length === 1 ? "" : "s"}.`,
          onClick: s.ticketId ? () => setOpenTicketId(s.ticketId!) : undefined,
        });
      });

    // Only approved leave ever lands in `leaveEvents` — a request is pending until
    // the employee's supervisor approves it (see Handover Requests), so nothing shows
    // here prematurely.
    me.leaveEvents.forEach((l) => {
      const start = parseLooseDate(l.start);
      const end = parseLooseDate(l.end);
      if (!start || !end) return;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        list.push({ key: `l-${l.id}-${d.getTime()}`, label: l.type, sublabel: "You", kind: "Leave", date: new Date(d) });
      }
    });

    events
      .filter((ev) => ev.authorId === me.id)
      .forEach((ev) => {
        const date = parseLooseDate(ev.date);
        if (!date) return;
        const timed = isTimedEvent(ev);
        list.push({
          key: ev.id,
          label: ev.title,
          sublabel: timed ? `${ev.startTime}–${ev.endTime}` : "You",
          kind: timed ? "Appointment" : "Custom",
          date,
          priority: ev.priority,
          itemType: timed ? "Appointment" : ev.itemType,
          note: ev.note,
        });
      });

    return list;
  }, [myTickets, me, events, tickets, getEntry]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewToggle view={view} onChange={setView} />
        <Link
          href="/employee/handover-requests"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-brand-50"
        >
          <CalendarClock className="h-4 w-4" strokeWidth={1.75} />
          Request Leave
        </Link>
      </div>

      <div className="mt-3 space-y-6">
        {view === "workload" ? (
          <>
            <div>
              <h1 className="text-2xl font-semibold text-ink tracking-tight">My Workload</h1>
              <p className="mt-1 text-sm text-ink-muted">
                Your scheduled tasks against your available working time — the same schedule your capacity numbers use.
              </p>
            </div>
            <WorkloadView employees={[me]} revealEventTitlesFor={me.id} />
            <AppointmentsManager employee={me} />
          </>
        ) : (
          <>
            <CalendarView
              title="My Calendar"
              subtitle="Your assigned tickets, planned work, approved leave, appointments and notes — visible only to you."
              items={items}
              onAddItem={async (input) => {
                await addEvent({
                  authorId: me.id,
                  authorName: me.name,
                  authorRole: "employee",
                  department: me.department,
                  title: input.title,
                  date: input.date,
                  priority: input.priority,
                  itemType: input.itemType,
                  note: input.note,
                });
              }}
            />
            <AppointmentsManager employee={me} />
          </>
        )}
      </div>

      {detailError && (
        <p className="mt-4 rounded-lg border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical)]">
          {detailError}
        </p>
      )}

      {detailTicket && (
        <TaskDetailPanel
          key={detailTicket.id}
          ticket={detailTicket}
          employees={employees.filter((e) => e.department === me.department && e.level !== "Supervisor")}
          currentUserName={me.name}
          currentEmployeeId={me.id}
          onClose={() => setOpenTicketId(null)}
          onUpdateStatus={(status, hold) => updateTicketStatus(detailTicket.id, status, hold).catch(() => setDetailError("Couldn't update status — check your connection and try again."))}
          onUpdatePriority={(priority) => updateTicketPriority(detailTicket.id, priority).catch(() => setDetailError("Couldn't update priority — check your connection and try again."))}
          onUpdateSkills={(skills) => updateTicketSkills(detailTicket.id, skills).catch(() => setDetailError("Couldn't update skills — check your connection and try again."))}
          onUpdateAssignees={(ids, split) => setTicketAssignees(detailTicket.id, ids, split).catch(() => setDetailError("Couldn't update assignees — check your connection and try again."))}
          onUpdateEffortSplit={(split) => setTicketEffortSplit(detailTicket.id, split).catch(() => setDetailError("Couldn't update the effort split — check your connection and try again."))}
          onRequestAdjustment={(draft) =>
            submitAdjustment({
              ticketId: detailTicket.id,
              employeeId: me.id,
              kind: draft.kind,
              requestedDeadline: draft.requestedDeadline,
              requestedHours: draft.requestedHours,
              justification: draft.justification,
            })
          }
        />
      )}
    </>
  );
}

function ViewToggle({ view, onChange }: { view: "calendar" | "workload"; onChange: (v: "calendar" | "workload") => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border-strong bg-surface p-1">
      <button
        onClick={() => onChange("calendar")}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          view === "calendar" ? "bg-brand-800 text-white" : "text-ink-secondary hover:bg-brand-50"
        }`}
      >
        <CalendarRange className="h-3.5 w-3.5" />
        Calendar
      </button>
      <button
        onClick={() => onChange("workload")}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          view === "workload" ? "bg-brand-800 text-white" : "text-ink-secondary hover:bg-brand-50"
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Workload
      </button>
    </div>
  );
}
