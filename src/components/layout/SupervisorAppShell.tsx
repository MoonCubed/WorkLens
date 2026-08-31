"use client";

import type { ReactNode } from "react";
import { AppShell } from "./AppShell";
import { useSupervisorSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";
import { getDepartmentSupervisor } from "@/lib/hr";

export function SupervisorAppShell({ children }: { children: ReactNode }) {
  const { unit } = useSupervisorSession();
  const { employees } = useEmployees();
  const supervisor = getDepartmentSupervisor(unit, employees);

  return (
    <AppShell role="supervisor" personaName={supervisor?.name ?? "No Supervisor Assigned"} personaTitle={unit}>
      {children}
    </AppShell>
  );
}
