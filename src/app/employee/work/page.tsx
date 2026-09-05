"use client";

import Link from "next/link";
import { Repeat2, CalendarRange } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { MyWorkList } from "@/components/employee/MyWorkList";
import { DailyTasks } from "@/components/employee/DailyTasks";
import { PlanMyDay } from "@/components/employee/PlanMyDay";
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">My Work</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Your active work, what&rsquo;s scheduled for today, and everything you&rsquo;ve completed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PlanMyDay employee={me} />
          <Link
            href="/employee/calendar"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-brand-50"
          >
            <CalendarRange className="h-4 w-4 text-brand-700" strokeWidth={1.75} />
            Calendar &amp; Workload
          </Link>
        </div>
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
          title="Today's Daily Tasks"
          subtitle="What you're scheduled to work on today. Use Plan My Day to arrange your hours, or the Calendar for future days and weeks."
        />
        <DailyTasks employee={me} todayOnly />
      </Card>

      <Card>
        <CardHeader title="Completed Tasks" subtitle="Work you've finished — kept for reference, no longer counted as active" />
        <MyWorkList employee={me} assignedTickets={assignedTickets} section="completed" />
      </Card>
    </div>
  );
}
