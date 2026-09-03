"use client";

import { Repeat2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { MyWorkList } from "@/components/employee/MyWorkList";
import { DailyTasks } from "@/components/employee/DailyTasks";
import { useEmployeeSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";
import { useTickets } from "@/store/tickets-store";
import { useWorkLog } from "@/store/work-log-store";
import { useCalendarEvents } from "@/store/calendar-events-store";
import { computeEmployeeWorkItems } from "@/lib/capacityEngine";

export default function MyWorkPage() {
  const { employeeId } = useEmployeeSession();
  const { employees } = useEmployees();
  const me = employees.find((e) => e.id === employeeId) ?? employees[0];
  const { tickets } = useTickets();
  const { getEntry } = useWorkLog();
  const { events } = useCalendarEvents();
  const assignedTickets = tickets.filter((t) => (t.assignedEmployeeIds ?? []).includes(me.id));
  const coverage = computeEmployeeWorkItems(me, tickets, getEntry, events).filter((i) => i.isCoverage);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">My Tasks</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your active work, what&rsquo;s scheduled day by day this week, and everything you&rsquo;ve completed.
        </p>
      </div>

      {coverage.length > 0 && (
        <Card>
          <CardHeader
            title="Covering for Teammates"
            subtitle="Time-boxed turnover coverage — you carry these tasks only for the leave window; ownership stays with the owner."
          />
          <ul className="divide-y divide-border">
            {coverage.map((c) => (
              <li key={c.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    <Repeat2 className="h-3.5 w-3.5 text-[color:var(--accent-teal)]" />
                    {c.title}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Covering {c.coverageOwnerName} · {c.remainingHours}h · through {c.dueDate}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--accent-teal)] bg-[var(--accent-teal-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--accent-teal)]">
                  Coverage
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Active Tasks" subtitle="In Progress, On Hold and Overdue work assigned to you" />
        <MyWorkList employee={me} assignedTickets={assignedTickets} section="active" />
      </Card>

      <Card>
        <CardHeader
          title="Daily Tasks"
          subtitle="Your scheduled work day by day — navigate between days and into future weeks. Each task's remaining effort is spread across the working days until its deadline."
        />
        <DailyTasks employee={me} />
      </Card>

      <Card>
        <CardHeader title="Completed Tasks" subtitle="Work you've finished — kept for reference, no longer counted as active" />
        <MyWorkList employee={me} assignedTickets={assignedTickets} section="completed" />
      </Card>
    </div>
  );
}
