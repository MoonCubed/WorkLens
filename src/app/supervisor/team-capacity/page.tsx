"use client";

import { useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { TeamCapacityView } from "@/components/team/TeamCapacityView";
import { useSupervisorSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";
import { useTickets } from "@/store/tickets-store";
import { getUnitTeam } from "@/lib/hr";

export default function TeamCapacityPage() {
  const { unit } = useSupervisorSession();
  const { employees } = useEmployees();
  const { tickets } = useTickets();
  // The supervisor owns the team's capacity — they are not counted as a team member.
  const team = useMemo(() => getUnitTeam(unit, employees), [employees, unit]);

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Team Capacity</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {unit} · search, filter and switch between table and card view. Click anyone for their full profile.
        </p>
      </div>

      <Card>
        <CardHeader title="Employees" subtitle={`${team.length} team members in ${unit}`} />
        <TeamCapacityView employees={team} tickets={tickets} detailBasePath="/supervisor/people" />
      </Card>
    </div>
  );
}
