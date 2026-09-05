"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { LeaveEvent } from "@/data/types";
import { supabase } from "@/lib/supabase";
import { todayLabel } from "@/lib/date";
import { useSupabaseTable } from "./use-supabase-table";

const TABLE = "handover_requests";

// One realistic pending request seeded for the demo: Layla has active migration work
// scheduled during her leave, and there are teammates free on those dates to cover it.
const SEED_REQUESTS: HandoverRequest[] = [
  {
    id: "HR-demo-1",
    employeeId: "layla-al-zahrani",
    note: "Pre-booked family travel. I've coordinated cover with Tariq for the Terraform migration and cost work.",
    startDate: "13 Sep 2026",
    endDate: "17 Sep 2026",
    affectedWork: [],
    status: "Pending Supervisor Review",
    submittedAt: "01 Sep 2026",
    leaveType: "Leave",
    preferredEmployeeId: "tariq-al-mutairi",
  },
];

export type HandoverStatus = "Pending Supervisor Review" | "Approved" | "Rejected";

export interface HandoverRequest {
  id: string;
  employeeId: string;
  /** The employee's justification for the leave/handover — required on every request.
   * (Stored in the `note` column.) */
  note: string;
  startDate: string;
  endDate: string;
  affectedWork: string[];
  /** The supervisor's actual decision — never a generic "Reviewed". Rows written by an
   * earlier build may still carry the legacy "Reviewed" value; the UI treats that as a
   * decided-but-unspecified outcome. */
  status: HandoverStatus | "Reviewed";
  submittedAt: string;
  /** Set when the supervisor decides. */
  reviewedAt?: string | null;
  /** The supervisor's justification — required on a rejection, shown to the employee. */
  decisionNote?: string | null;
  /** The handover workflow uses the single generic type "Leave"; approving a request
   * (see the supervisor's Handover page) adds a matching "Leave" entry to the
   * employee's `leaveEvents`, which is what the calendar and HR's Employee Calendar
   * read from. */
  leaveType: LeaveEvent["type"];
  /** An optional peer the employee has already coordinated the turnover with — a
   * recommendation for the supervisor, never an automatic assignment. */
  preferredEmployeeId?: string | null;
}

interface HandoverRequestsContextValue {
  requests: HandoverRequest[];
  loading: boolean;
  error: string | null;
  submitRequest: (input: Omit<HandoverRequest, "id" | "status" | "submittedAt">) => Promise<void>;
  /** Record the supervisor's decision. A rejection must carry a justification; it is
   * stored on the request and shown to the employee. */
  resolve: (id: string, decision: "Approved" | "Rejected", decisionNote?: string) => Promise<void>;
}

const HandoverRequestsContext = createContext<HandoverRequestsContextValue | null>(null);

export function HandoverRequestsProvider({ children }: { children: ReactNode }) {
  const { rows: requests, loading, error, refetch } = useSupabaseTable<HandoverRequest>(TABLE, SEED_REQUESTS);

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

  const resolve = useCallback(
    async (id: string, decision: "Approved" | "Rejected", decisionNote?: string) => {
      const { error: updateError } = await supabase
        .from(TABLE)
        .update({ status: decision, decisionNote: decisionNote?.trim() || null, reviewedAt: todayLabel() })
        .eq("id", id);
      if (updateError) throw updateError;
      await refetch();
    },
    [refetch]
  );

  const value = useMemo(
    () => ({ requests, loading, error, submitRequest, resolve }),
    [requests, loading, error, submitRequest, resolve]
  );

  return <HandoverRequestsContext.Provider value={value}>{children}</HandoverRequestsContext.Provider>;
}

export function useHandoverRequests() {
  const ctx = useContext(HandoverRequestsContext);
  if (!ctx) throw new Error("useHandoverRequests must be used within HandoverRequestsProvider");
  return ctx;
}
