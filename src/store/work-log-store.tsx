"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { WorkflowStatus } from "@/data/types";
import { supabase } from "@/lib/supabase";
import { useSupabaseTable } from "@/store/use-supabase-table";
import { todayLabel } from "@/lib/date";

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
  comments: WorkLogComment[];
}

export interface WorkLogEntry {
  workflowStatus?: WorkflowStatus;
  progress?: number;
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
  setWorkflowStatus: (key: string, status: WorkflowStatus) => Promise<void>;
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
      return row ? { workflowStatus: row.workflowStatus, progress: row.progress, comments: row.comments ?? [] } : EMPTY_ENTRY;
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
    (key: string, status: WorkflowStatus) => upsertEntry(key, { workflowStatus: status }),
    [upsertEntry]
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
