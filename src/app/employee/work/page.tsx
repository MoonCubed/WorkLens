"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { MyWorkList } from "@/components/employee/MyWorkList";
import { DailyTasks } from "@/components/employee/DailyTasks";
import { useEmployeeSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";
import { useTickets } from "@/store/tickets-store";

export default function MyWorkPage() {
  const { employeeId } = useEmployeeSession();
  const { employees } = useEmployees();
  const me = employees.find((e) => e.id === employeeId) ?? employees[0];
  const { tickets } = useTickets();
  const assignedTickets = tickets.filter((t) => (t.assignedEmployeeIds ?? []).includes(me.id));

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">My Tasks</h1>
        <p className="mt-1 text-sm text-ink-muted">
          What&rsquo;s planned each day, your active work, and everything you&rsquo;ve completed.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Daily Tasks"
          subtitle="Each task's estimated effort spread evenly across the working days until its deadline"
        />
        <DailyTasks employee={me} workingDays={10} />
      </Card>

      <Card>
        <CardHeader title="Active Tasks" subtitle="In Progress, On Hold and Overdue work assigned to you" />
        <MyWorkList employee={me} assignedTickets={assignedTickets} section="active" />
      </Card>

      <Card>
        <CardHeader title="Completed Tasks" subtitle="Work you've finished — kept for reference, no longer counted as active" />
        <MyWorkList employee={me} assignedTickets={assignedTickets} section="completed" />
      </Card>
    </div>
  );
}
