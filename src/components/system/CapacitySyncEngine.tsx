"use client";

import { useEffect, useRef } from "react";
import { useEmployees } from "@/store/employees-store";
import { useTickets } from "@/store/tickets-store";
import { useWorkLog } from "@/store/work-log-store";
import { computeEmployeeCapacity } from "@/lib/capacityEngine";

/** Keeps `Employee.currentUtilization` truthful. This is the one place that recomputes
 * it — from live ticket assignments, ad-hoc items, and logged progress/status — and
 * writes it back, so assigning work, completing it, or updating progress immediately
 * shows up everywhere that already reads `currentUtilization` (Team Capacity, the
 * employee pages, ticket/candidate ranking, Handover, What-If) with no changes needed
 * in any of those files. Renders nothing; mounted once at the root, inside every
 * provider it reads from, after their initial Supabase load completes.
 *
 * Re-derives and diffs against the stored value on every relevant data change; only
 * employees whose computed number has actually drifted get written, so this settles
 * instead of looping (a write triggers a refetch, which re-runs this effect, which then
 * finds nothing left to change). */
export function CapacitySyncEngine() {
  const { employees, updateEmployee } = useEmployees();
  const { tickets } = useTickets();
  const { getEntry } = useWorkLog();
  const syncing = useRef(false);

  useEffect(() => {
    if (syncing.current) return;

    const drifted = employees
      .map((employee) => ({ employee, next: computeEmployeeCapacity(employee, tickets, getEntry).utilization }))
      .filter(({ employee, next }) => employee.currentUtilization !== next);

    if (drifted.length === 0) return;

    syncing.current = true;
    Promise.all(drifted.map(({ employee, next }) => updateEmployee(employee.id, { currentUtilization: next })))
      .catch(() => {
        // Best-effort — a transient failure here just means the next data change
        // (or the periodic re-render) gets another chance to reconcile it.
      })
      .finally(() => {
        syncing.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, tickets, getEntry]);

  return null;
}
