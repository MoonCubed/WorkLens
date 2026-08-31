"use client";

import type { ReactNode } from "react";
import { AppShell } from "./AppShell";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useEmployeeSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";

export function EmployeeAppShell({ children }: { children: ReactNode }) {
  const { employeeId } = useEmployeeSession();
  const { employees } = useEmployees();
  const employee = employees.find((e) => e.id === employeeId) ?? employees[0];

  if (!employee) {
    return <LoadingScreen error="No employee record found. Please sign in again from the employee login." />;
  }

  return (
    <AppShell role="employee" personaName={employee.name} personaTitle={employee.department}>
      {children}
    </AppShell>
  );
}
