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

export interface DayPlanAllocation {
  /** The schedule item key ("<employeeId>:<itemId>") this allocation is for, or a
   * synthetic key for a calendar commitment. */
  key: string;
  title: string;
  hours: number;
  /** "In Progress" | "On Hold" | "Overdue" | "Deadline risk" | "Appointment" */
  status: string;
  ticketId?: string | null;
  /** Short "why this, this much, now" explanation shown next to the row. */
  reason?: string;
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

  const clearPlan = useCallback(
    async (employeeId: string, date: string) => {
      const { error: deleteError } = await supabase.from(TABLE).delete().eq("id", planId(employeeId, date));
      if (deleteError) throw deleteError;
      await refetch();
    },
    [refetch]
  );

  const value = useMemo(
    () => ({ plans, loading, error, getPlan, savePlan, clearPlan }),
    [plans, loading, error, getPlan, savePlan, clearPlan]
  );

  return <DayPlansContext.Provider value={value}>{children}</DayPlansContext.Provider>;
}

export function useDayPlans() {
  const ctx = useContext(DayPlansContext);
  if (!ctx) throw new Error("useDayPlans must be used within DayPlansProvider");
  return ctx;
}
