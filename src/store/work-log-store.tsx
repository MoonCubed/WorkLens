"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { WorkflowStatus } from "@/data/types";
import { supabase } from "@/lib/supabase";
import { useSupabaseTable } from "@/store/use-supabase-table";
import { todayLabel } from "@/lib/date";

/** Hold window captured when an item is set to On Hold. */
export interface HoldWindow {
  holdStartDate: string;
  holdEndDate: string;
}

// Overlays employee-controlled workflow status and a shared comment thread onto the
// otherwise-static work items (projects/tickets/ad-hoc) each employee record carries.
// Keyed by "<employeeId>:<itemId>" so items from different employees never collide;
// that composite key maps directly to work_log_entries' (employeeId, itemId) primary key.
// Comments are a single chronological thread — both the employee and their supervisor
// can add to it, each entry carrying who wrote it and when.

const TABLE = "work_log_entries";

export interface WorkLogComment {
  text: string;
  at: string;
  author: string;
}

interface WorkLogRow {
  employeeId: string;
  itemId: string;
  workflowStatus?: WorkflowStatus;
  /** 0-100. How much of the item's estimated effort is done — drives the remaining-hours
   * figure used for capacity everywhere (Team Capacity, Supervisor Dashboard, ...). */
  progress?: number;
  /** The date this item was marked Completed ("26 Aug 2026" style). Persisted so it
   * survives a refresh and is shown everywhere; cleared if it leaves Completed. */
  completedAt?: string | null;
  /** The hold window when workflowStatus is "On Hold". */
  holdStartDate?: string | null;
  holdEndDate?: string | null;
  comments: WorkLogComment[];
}

export interface WorkLogEntry {
  workflowStatus?: WorkflowStatus;
  progress?: number;
  completedAt?: string | null;
  holdStartDate?: string | null;
  holdEndDate?: string | null;
  comments: WorkLogComment[];
}

const EMPTY_ENTRY: WorkLogEntry = { comments: [] };

function splitKey(key: string): { employeeId: string; itemId: string } {
  const idx = key.indexOf(":");
  return { employeeId: key.slice(0, idx), itemId: key.slice(idx + 1) };
}

interface WorkLogContextValue {
  loading: boolean;
  error: string | null;
  getEntry: (key: string) => WorkLogEntry;
  /** Set the item's workflow status. Completing it stamps `completedAt` (today) and
   * frees the item from capacity; moving it back out of Completed clears that stamp.
   * Setting it On Hold records the given hold window; any other status clears it. */
  setWorkflowStatus: (key: string, status: WorkflowStatus, hold?: HoldWindow) => Promise<void>;
  setProgress: (key: string, progress: number) => Promise<void>;
  addComment: (key: string, text: string, author: string) => Promise<void>;
}

const WorkLogContext = createContext<WorkLogContextValue | null>(null);

export function WorkLogProvider({ children }: { children: ReactNode }) {
  const { rows, loading, error, refetch } = useSupabaseTable<WorkLogRow>(TABLE, []);

  const getEntry = useCallback(
    (key: string): WorkLogEntry => {
      const { employeeId, itemId } = splitKey(key);
      const row = rows.find((r) => r.employeeId === employeeId && r.itemId === itemId);
      return row
        ? {
            workflowStatus: row.workflowStatus,
            progress: row.progress,
            completedAt: row.completedAt ?? null,
            holdStartDate: row.holdStartDate ?? null,
            holdEndDate: row.holdEndDate ?? null,
            comments: row.comments ?? [],
          }
        : EMPTY_ENTRY;
    },
    [rows]
  );

  const upsertEntry = useCallback(
    async (key: string, patch: Partial<Omit<WorkLogRow, "employeeId" | "itemId">>) => {
      const { employeeId, itemId } = splitKey(key);
      const current = getEntry(key);
      const row: WorkLogRow = { employeeId, itemId, ...current, ...patch };
      const { error: upsertError } = await supabase.from(TABLE).upsert(row, { onConflict: "employeeId,itemId" });
      if (upsertError) throw upsertError;
      await refetch();
    },
    [getEntry, refetch]
  );

  const setWorkflowStatus = useCallback(
    (key: string, status: WorkflowStatus, hold?: HoldWindow) =>
      upsertEntry(key, {
        workflowStatus: status,
        // Completion date: stamped on the way into Completed, cleared on the way out.
        completedAt: status === "Completed" ? (getEntry(key).completedAt ?? todayLabel()) : null,
        // Hold window: kept only while On Hold.
        holdStartDate: status === "On Hold" ? (hold?.holdStartDate ?? getEntry(key).holdStartDate ?? null) : null,
        holdEndDate: status === "On Hold" ? (hold?.holdEndDate ?? getEntry(key).holdEndDate ?? null) : null,
      }),
    [upsertEntry, getEntry]
  );

  const setProgress = useCallback(
    (key: string, progress: number) => upsertEntry(key, { progress: Math.min(100, Math.max(0, Math.round(progress))) }),
    [upsertEntry]
  );

  const addComment = useCallback(
    (key: string, text: string, author: string) => {
      const entry = getEntry(key);
      return upsertEntry(key, { comments: [...entry.comments, { text, at: todayLabel(), author }] });
    },
    [getEntry, upsertEntry]
  );

  const value = useMemo(
    () => ({ loading, error, getEntry, setWorkflowStatus, setProgress, addComment }),
    [loading, error, getEntry, setWorkflowStatus, setProgress, addComment]
  );

  return <WorkLogContext.Provider value={value}>{children}</WorkLogContext.Provider>;
}

export function useWorkLog() {
  const ctx = useContext(WorkLogContext);
  if (!ctx) throw new Error("useWorkLog must be used within WorkLogProvider");
  return ctx;
}
