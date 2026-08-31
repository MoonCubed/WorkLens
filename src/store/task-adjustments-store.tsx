"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useSupabaseTable } from "@/store/use-supabase-table";

// An employee asks their supervisor to adjust one of their tasks — extend the
// deadline, change the estimated effort, revisit the assignment, or something else.
// The request goes to the supervisor's Tasks page for review; the task itself only
// changes if the supervisor approves. Not part of RootDataGate's blocking load
// (same as calendar_events / skills) so a missing table degrades gracefully.
const TABLE = "task_adjustment_requests";

export type AdjustmentKind = "deadline" | "effort" | "reassignment" | "other";

export interface TaskAdjustmentRequest {
  id: string;
  ticketId: string;
  employeeId: string;
  kind: AdjustmentKind;
  /** For kind "deadline" — the "13 Sep 2026"-style date the employee wants. */
  requestedDeadline?: string | null;
  /** For kind "effort" — the total estimated hours the employee thinks it needs. */
  requestedHours?: number | null;
  justification: string;
  status: "Pending Review" | "Approved" | "Dismissed";
  submittedAt: string;
}

interface TaskAdjustmentsContextValue {
  requests: TaskAdjustmentRequest[];
  loading: boolean;
  error: string | null;
  submit: (input: Omit<TaskAdjustmentRequest, "id" | "status" | "submittedAt">) => Promise<void>;
  resolve: (id: string, status: "Approved" | "Dismissed") => Promise<void>;
}

const TaskAdjustmentsContext = createContext<TaskAdjustmentsContextValue | null>(null);

export function TaskAdjustmentsProvider({ children }: { children: ReactNode }) {
  const { rows: requests, loading, error, refetch } = useSupabaseTable<TaskAdjustmentRequest>(TABLE, []);

  const submit = useCallback(
    async (input: Omit<TaskAdjustmentRequest, "id" | "status" | "submittedAt">) => {
      const created: TaskAdjustmentRequest = {
        ...input,
        id: `ADJ-${Date.now().toString(36)}`,
        status: "Pending Review",
        submittedAt: new Date().toISOString(),
      };
      const { error: insertError } = await supabase.from(TABLE).insert(created);
      if (insertError) throw insertError;
      await refetch();
    },
    [refetch]
  );

  const resolve = useCallback(
    async (id: string, status: "Approved" | "Dismissed") => {
      const { error: updateError } = await supabase.from(TABLE).update({ status }).eq("id", id);
      if (updateError) throw updateError;
      await refetch();
    },
    [refetch]
  );

  const value = useMemo(
    () => ({ requests, loading, error, submit, resolve }),
    [requests, loading, error, submit, resolve]
  );

  return <TaskAdjustmentsContext.Provider value={value}>{children}</TaskAdjustmentsContext.Provider>;
}

export function useTaskAdjustments() {
  const ctx = useContext(TaskAdjustmentsContext);
  if (!ctx) throw new Error("useTaskAdjustments must be used within TaskAdjustmentsProvider");
  return ctx;
}
