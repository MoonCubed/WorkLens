"use client";

import { useMemo, type ReactNode } from "react";
import { AppShell } from "./AppShell";
import { useSupervisorSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";
import { useTickets, unassignedTicketsForUnit } from "@/store/tickets-store";
import { useHandoverRequests } from "@/store/handover-requests-store";
import { useSkillChangeRequests } from "@/store/skill-change-requests-store";
import { getDepartmentSupervisor, getUnitTeam } from "@/lib/hr";

export function SupervisorAppShell({ children }: { children: ReactNode }) {
  const { unit } = useSupervisorSession();
  const { employees } = useEmployees();
  const { tickets } = useTickets();
  const { requests: handoverRequests } = useHandoverRequests();
  const { requests: skillChangeRequests } = useSkillChangeRequests();

  const supervisor = getDepartmentSupervisor(unit, employees);

  // Pending items that need the supervisor's attention, keyed by nav href. Recomputed
  // whenever the underlying Supabase-backed data changes, so a badge clears the moment
  // a request is assigned, approved or rejected. Zero counts render nothing.
  const navBadges = useMemo(() => {
    const unitIds = new Set(getUnitTeam(unit, employees).map((e) => e.id));
    return {
      "/supervisor/work": unassignedTicketsForUnit(tickets, unit).length,
      "/supervisor/skills": skillChangeRequests.filter(
        (r) => r.status === "Pending" && unitIds.has(r.employeeId)
      ).length,
      "/supervisor/handover": handoverRequests.filter(
        (r) => r.status === "Pending Supervisor Review" && unitIds.has(r.employeeId)
      ).length,
    };
  }, [unit, employees, tickets, handoverRequests, skillChangeRequests]);

  return (
    <AppShell
      role="supervisor"
      personaName={supervisor?.name ?? "No Supervisor Assigned"}
      personaTitle={unit}
      navBadges={navBadges}
    >
      {children}
    </AppShell>
  );
}
