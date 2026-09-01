"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { SkillLevel } from "@/data/types";
import { supabase } from "@/lib/supabase";
import { useSupabaseTable } from "@/store/use-supabase-table";
import { todayLabel } from "@/lib/date";

// An employee's edits to their own skills are NOT written straight to the official HR
// skill record. Each add / remove / level-change becomes one pending request here that
// their supervisor reviews (Supervisor -> Skills); only on approval does the caller
// apply it to the employee's `skills` list. Not part of RootDataGate's blocking load
// (same as calendar_events / skills) so a missing table degrades gracefully.
const TABLE = "skill_change_requests";

export type SkillChangeKind = "add" | "remove" | "update";
export type SkillChangeStatus = "Pending" | "Approved" | "Rejected";

export interface SkillChangeRequest {
  id: string;
  employeeId: string;
  kind: SkillChangeKind;
  skillName: string;
  /** Target level for "add" / "update". */
  skillLevel?: SkillLevel | null;
  /** The employee's current level for "remove" / "update", for the reviewer's context. */
  previousLevel?: SkillLevel | null;
  status: SkillChangeStatus;
  submittedAt: string;
  reviewedAt?: string | null;
}

interface SkillChangeRequestsContextValue {
  requests: SkillChangeRequest[];
  loading: boolean;
  error: string | null;
  /** Employee raises a pending change to their own skills. */
  submit: (input: Omit<SkillChangeRequest, "id" | "status" | "submittedAt" | "reviewedAt">) => Promise<void>;
  /** Supervisor decision — the caller applies an approved change to the employee record. */
  resolve: (id: string, status: "Approved" | "Rejected") => Promise<void>;
}

const SkillChangeRequestsContext = createContext<SkillChangeRequestsContextValue | null>(null);

export function SkillChangeRequestsProvider({ children }: { children: ReactNode }) {
  const { rows: requests, loading, error, refetch } = useSupabaseTable<SkillChangeRequest>(TABLE, []);

  const submit = useCallback(
    async (input: Omit<SkillChangeRequest, "id" | "status" | "submittedAt" | "reviewedAt">) => {
      const created: SkillChangeRequest = {
        ...input,
        id: `SKL-${Date.now().toString(36)}`,
        status: "Pending",
        submittedAt: todayLabel(),
        reviewedAt: null,
      };
      const { error: insertError } = await supabase.from(TABLE).insert(created);
      if (insertError) throw insertError;
      await refetch();
    },
    [refetch]
  );

  const resolve = useCallback(
    async (id: string, status: "Approved" | "Rejected") => {
      const { error: updateError } = await supabase
        .from(TABLE)
        .update({ status, reviewedAt: todayLabel() })
        .eq("id", id);
      if (updateError) throw updateError;
      await refetch();
    },
    [refetch]
  );

  const value = useMemo(
    () => ({ requests, loading, error, submit, resolve }),
    [requests, loading, error, submit, resolve]
  );

  return <SkillChangeRequestsContext.Provider value={value}>{children}</SkillChangeRequestsContext.Provider>;
}

export function useSkillChangeRequests() {
  const ctx = useContext(SkillChangeRequestsContext);
  if (!ctx) throw new Error("useSkillChangeRequests must be used within SkillChangeRequestsProvider");
  return ctx;
}
