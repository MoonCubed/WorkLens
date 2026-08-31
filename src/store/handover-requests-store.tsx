"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { LeaveEvent } from "@/data/types";
import { supabase } from "@/lib/supabase";
import { useSupabaseTable } from "./use-supabase-table";

const TABLE = "handover_requests";

export interface HandoverRequest {
  id: string;
  employeeId: string;
  note: string;
  startDate: string;
  endDate: string;
  affectedWork: string[];
  status: "Pending Supervisor Review" | "Reviewed";
  submittedAt: string;
  /** The kind of leave this unavailability represents — every request submitted from
   * the employee portal carries one, so a handover request doubles as a leave request:
   * approving it (see the supervisor's Handover page) adds a matching entry to the
   * employee's `leaveEvents`, which is what the calendar and HR's Leaves tab read from. */
  leaveType: LeaveEvent["type"];
}

interface HandoverRequestsContextValue {
  requests: HandoverRequest[];
  loading: boolean;
  error: string | null;
  submitRequest: (input: Omit<HandoverRequest, "id" | "status" | "submittedAt">) => Promise<void>;
  markReviewed: (id: string) => Promise<void>;
}

const HandoverRequestsContext = createContext<HandoverRequestsContextValue | null>(null);

export function HandoverRequestsProvider({ children }: { children: ReactNode }) {
  const { rows: requests, loading, error, refetch } = useSupabaseTable<HandoverRequest>(TABLE, []);

  const submitRequest = useCallback(
    async (input: Omit<HandoverRequest, "id" | "status" | "submittedAt">) => {
      const created: HandoverRequest = {
        ...input,
        id: `HR-${Date.now().toString(36)}`,
        status: "Pending Supervisor Review",
        submittedAt: "Just now",
      };
      const { error: insertError } = await supabase.from(TABLE).insert(created);
      if (insertError) throw insertError;
      await refetch();
    },
    [refetch]
  );

  const markReviewed = useCallback(
    async (id: string) => {
      const { error: updateError } = await supabase.from(TABLE).update({ status: "Reviewed" }).eq("id", id);
      if (updateError) throw updateError;
      await refetch();
    },
    [refetch]
  );

  const value = useMemo(
    () => ({ requests, loading, error, submitRequest, markReviewed }),
    [requests, loading, error, submitRequest, markReviewed]
  );

  return <HandoverRequestsContext.Provider value={value}>{children}</HandoverRequestsContext.Provider>;
}

export function useHandoverRequests() {
  const ctx = useContext(HandoverRequestsContext);
  if (!ctx) throw new Error("useHandoverRequests must be used within HandoverRequestsProvider");
  return ctx;
}
