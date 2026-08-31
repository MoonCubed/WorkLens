"use client";

import { useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { CapacityChart } from "@/components/charts/CapacityChart";
import { MyWorkList } from "@/components/employee/MyWorkList";
import { computeEmployeeCapacity } from "@/lib/capacityEngine";
import { useEmployeeSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";
import { useTickets } from "@/store/tickets-store";
import { useWorkLog } from "@/store/work-log-store";

export default function MyWorkPage() {
  const { employeeId } = useEmployeeSession();
  const { employees } = useEmployees();
  const me = employees.find((e) => e.id === employeeId) ?? employees[0];
  const { tickets } = useTickets();
  const { getEntry } = useWorkLog();
  const assignedTickets = tickets.filter((t) => (t.assignedEmployeeIds ?? []).includes(me.id));
  const capacity = useMemo(() => computeEmployeeCapacity(me, tickets, getEntry), [me, tickets, getEntry]);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">My Work</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Update status, add notes and message your supervisor on anything assigned to you.
        </p>
      </div>

      <Card>
        <CardHeader title="Current Assignments" subtitle="Projects, tickets and ad-hoc responsibilities" />
        <MyWorkList employee={me} assignedTickets={assignedTickets} />
      </Card>

      <Card>
        <CardHeader title="Capacity Over Time" subtitle="Weekly or monthly — this period is live, the rest is forecast" />
        <CapacityChart current={capacity.utilization} forecast={me.forecast8Week} currentLabelText="This period" />
      </Card>
    </div>
  );
}
