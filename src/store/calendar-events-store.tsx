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
}

interface CalendarEventsContextValue {
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
  addEvent: (input: Omit<CalendarEvent, "id" | "createdAt">) => Promise<void>;
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

  const value = useMemo(() => ({ events, loading, error, addEvent }), [events, loading, error, addEvent]);

  return <CalendarEventsContext.Provider value={value}>{children}</CalendarEventsContext.Provider>;
}

export function useCalendarEvents() {
  const ctx = useContext(CalendarEventsContext);
  if (!ctx) throw new Error("useCalendarEvents must be used within CalendarEventsProvider");
  return ctx;
}
