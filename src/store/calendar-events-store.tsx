"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { Department } from "@/data/types";
import { supabase } from "@/lib/supabase";
import { useSupabaseTable } from "@/store/use-supabase-table";
import { todayLabel } from "@/lib/date";

// Personal calendar entries a supervisor or employee adds themselves — separate from
// ticket deadlines and leave, which are already tracked elsewhere. Private to whoever
// created it: an employee's own entries never show on the supervisor's calendar (or a
// teammate's), and a supervisor's own entries never show on an employee's calendar.
const TABLE = "calendar_events";

export interface CalendarEvent {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: "supervisor" | "employee";
  department: Department;
  title: string;
  date: string;
  priority: "High" | "Medium" | "Low";
  itemType: string;
  note: string;
  createdAt: string;
  /** Optional 24h "HH:MM" start/end. When both are set the entry is a timed personal
   * commitment (an appointment) that reduces the author's available working capacity
   * for that day. Untimed entries are plain calendar notes and never affect capacity. */
  startTime?: string | null;
  endTime?: string | null;
}

/** True when the entry is a timed personal commitment — both times set and end after
 * start. These are the only calendar events that reduce available capacity. */
export function isTimedEvent(ev: Pick<CalendarEvent, "startTime" | "endTime">): boolean {
  if (!ev.startTime || !ev.endTime) return false;
  return ev.endTime > ev.startTime;
}

interface CalendarEventsContextValue {
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
  addEvent: (input: Omit<CalendarEvent, "id" | "createdAt">) => Promise<void>;
  updateEvent: (id: string, patch: Partial<Omit<CalendarEvent, "id" | "createdAt" | "authorId">>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
}

const CalendarEventsContext = createContext<CalendarEventsContextValue | null>(null);

function nextEventId(existing: CalendarEvent[]): string {
  const numbers = existing.map((e) => Number(e.id.replace("evt-", ""))).filter((n) => !Number.isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `evt-${next}`;
}

export function CalendarEventsProvider({ children }: { children: ReactNode }) {
  const { rows: events, loading, error, refetch } = useSupabaseTable<CalendarEvent>(TABLE, []);

  const addEvent = useCallback(
    async (input: Omit<CalendarEvent, "id" | "createdAt">) => {
      const created: CalendarEvent = { ...input, id: nextEventId(events), createdAt: todayLabel() };
      const { error: insertError } = await supabase.from(TABLE).insert(created);
      if (insertError) throw insertError;
      await refetch();
    },
    [events, refetch]
  );

  const updateEvent = useCallback(
    async (id: string, patch: Partial<Omit<CalendarEvent, "id" | "createdAt" | "authorId">>) => {
      const { error: updateError } = await supabase.from(TABLE).update(patch).eq("id", id);
      if (updateError) throw updateError;
      await refetch();
    },
    [refetch]
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      const { error: deleteError } = await supabase.from(TABLE).delete().eq("id", id);
      if (deleteError) throw deleteError;
      await refetch();
    },
    [refetch]
  );

  const value = useMemo(
    () => ({ events, loading, error, addEvent, updateEvent, deleteEvent }),
    [events, loading, error, addEvent, updateEvent, deleteEvent]
  );

  return <CalendarEventsContext.Provider value={value}>{children}</CalendarEventsContext.Provider>;
}

export function useCalendarEvents() {
  const ctx = useContext(CalendarEventsContext);
  if (!ctx) throw new Error("useCalendarEvents must be used within CalendarEventsProvider");
  return ctx;
}
