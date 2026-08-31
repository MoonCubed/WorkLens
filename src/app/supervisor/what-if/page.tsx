"use client";

import { useMemo } from "react";
import { WhatIfSimulator } from "@/components/whatif/WhatIfSimulator";
import { useSupervisorSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";
import { getUnitTeam } from "@/lib/hr";

export default function WhatIfPage() {
  const { unit } = useSupervisorSession();
  const { employees } = useEmployees();
  const unitEmployees = useMemo(() => getUnitTeam(unit, employees), [employees, unit]);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Capacity Scenario Simulator</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Simulate the impact of new work before making an allocation decision.
        </p>
      </div>
      <WhatIfSimulator employees={unitEmployees} />
    </div>
  );
}
