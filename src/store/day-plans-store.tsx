"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useSupabaseTable } from "@/store/use-supabase-table";
import { nowLabel } from "@/lib/date";

// The employee-confirmed plan for a single day — the output of "Plan My Day" once the
// employee has reviewed and applied it. One row per (employee, day). The suggestion
// itself is generated from the existing schedule / capacity / priority logic
// (`lib/planDay.ts`); nothing is stored until the employee confirms. Daily Tasks shows
// the saved plan for that day; weekly and overall capacity stay derived from the
// shared engine — a day plan only re-orders work within the day, it is not a second
// scheduling system. Not part of RootDataGate's blocking load (like calendar_events /
// skills) so a missing table degrades gracefully.
const TABLE = "day_plans";

export type DayPlanConfirm = "planned" | "partial" | "skipped";

export interface DayPlanAllocation {
  /** The schedule item key ("<employeeId>:<itemId>") this allocation is for, or a
   * synthetic key for a calendar commitment. */
  key: string;
  title: string;
  hours: number;
  /** Start / end of this block as 24h "HH:MM", on the 30-minute grid. Present on every
   * plan built by the time-based planner; older rows may only have `hours`. */
  startTime?: string | null;
  endTime?: string | null;
  /** "In Progress" | "On Hold" | "Overdue" | "Deadline risk" | "Appointment" */
  status: string;
  ticketId?: string | null;
  /** Short "why this, this much, now" explanation shown next to the row. */
  reason?: string;
  /** End-of-day confirmation: what actually happened with this block, and the hours
   * the employee confirmed were worked (added to the task's actual effort). */
  confirm?: DayPlanConfirm | null;
  worked?: number | null;
}

export interface DayPlan {
  id: string;
  employeeId: string;
  /** "YYYY-MM-DD". */
  date: string;
  availableHours: number;
  allocations: DayPlanAllocation[];
  note: string;
  createdAt: string;
  /** Set once the employee has run the end-of-day "did you work these hours?" check
   * and the confirmed hours have been written to each task's actual effort. */
  confirmedAt?: string | null;
}

function planId(employeeId: string, date: string): string {
  return `${employeeId}:${date}`;
}

interface DayPlansContextValue {
  plans: DayPlan[];
  loading: boolean;
  error: string | null;
  getPlan: (employeeId: string, date: string) => DayPlan | null;
  savePlan: (input: Omit<DayPlan, "id" | "createdAt">) => Promise<void>;
  /** Merge a change into an existing plan (keeps `createdAt`) — used by the
   * end-of-day worked-hours confirmation. */
  patchPlan: (employeeId: string, date: string, patch: Partial<Omit<DayPlan, "id" | "employeeId" | "date">>) => Promise<void>;
  clearPlan: (employeeId: string, date: string) => Promise<void>;
}

const DayPlansContext = createContext<DayPlansContextValue | null>(null);

export function DayPlansProvider({ children }: { children: ReactNode }) {
  const { rows: plans, loading, error, refetch } = useSupabaseTable<DayPlan>(TABLE, []);

  const getPlan = useCallback(
    (employeeId: string, date: string) => plans.find((p) => p.id === planId(employeeId, date)) ?? null,
    [plans]
  );

  const savePlan = useCallback(
    async (input: Omit<DayPlan, "id" | "createdAt">) => {
      const row: DayPlan = { ...input, id: planId(input.employeeId, input.date), createdAt: nowLabel() };
      const { error: upsertError } = await supabase.from(TABLE).upsert(row, { onConflict: "id" });
      if (upsertError) throw upsertError;
      await refetch();
    },
    [refetch]
  );

  const patchPlan = useCallback(
    async (employeeId: string, date: string, patch: Partial<Omit<DayPlan, "id" | "employeeId" | "date">>) => {
      const id = planId(employeeId, date);
      const current = plans.find((p) => p.id === id);
      if (!current) throw new Error("No saved plan to update for this day.");
      const row: DayPlan = { ...current, ...patch, id, employeeId, date };
      const { error: upsertError } = await supabase.from(TABLE).upsert(row, { onConflict: "id" });
      if (upsertError) throw upsertError;
      await refetch();
    },
    [plans, refetch]
  );

  const clearPlan = useCallback(
    async (employeeId: string, date: string) => {
      const { error: deleteError } = await supabase.from(TABLE).delete().eq("id", planId(employeeId, date));
      if (deleteError) throw deleteError;
      await refetch();
    },
    [refetch]
  );

  const value = useMemo(
    () => ({ plans, loading, error, getPlan, savePlan, patchPlan, clearPlan }),
    [plans, loading, error, getPlan, savePlan, patchPlan, clearPlan]
  );

  return <DayPlansContext.Provider value={value}>{children}</DayPlansContext.Provider>;
}

export function useDayPlans() {
  const ctx = useContext(DayPlansContext);
  if (!ctx) throw new Error("useDayPlans must be used within DayPlansProvider");
  return ctx;
}
