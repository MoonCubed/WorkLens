"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Employee } from "@/data/types";
import { useTickets } from "@/store/tickets-store";
import { useWorkLog } from "@/store/work-log-store";
import { useCalendarEvents } from "@/store/calendar-events-store";
import { computeEmployeeWeeklyCapacity, isCurrentlyOnLeave } from "@/lib/capacityEngine";

const MONTH_WEEKS = 4;

/**
 * Wraps an employee's name so hovering it shows a small popover with their Weekly and
 * Monthly Capacity — the same weekly-capacity engine every other capacity figure in
 * WorkLens uses, just read at two different horizons (this week, and the average of
 * the next four). Deliberately lightweight: no click, no navigation, nothing else
 * changes about the list or row it sits in.
 */
export function EmployeeCapacityHover({ employee, children, className }: { employee: Employee; children: ReactNode; className?: string }) {
  const { tickets } = useTickets();
  const { getEntry } = useWorkLog();
  const { events } = useCalendarEvents();
  const [open, setOpen] = useState(false);

  const { weekly, monthly, onLeave } = useMemo(() => {
    const weeks = computeEmployeeWeeklyCapacity(employee, tickets, getEntry, MONTH_WEEKS, undefined, events);
    const w = weeks[0]?.utilization ?? employee.currentUtilization;
    const m = weeks.length ? Math.round(weeks.reduce((s, p) => s + p.utilization, 0) / weeks.length) : w;
    return { weekly: w, monthly: m, onLeave: isCurrentlyOnLeave(employee) };
  }, [employee, tickets, getEntry, events]);

  return (
    <span
      className={`relative inline-block ${className ?? ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-44 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg"
        >
          <p className="font-semibold">{employee.name.split(" ")[0]}</p>
          {onLeave && <p className="mt-0.5 text-white/70">Currently on leave</p>}
          <p className="mt-1 flex items-center justify-between gap-3 text-white/80">
            <span>Weekly Capacity</span>
            <span className="tabular font-medium text-white">{weekly}%</span>
          </p>
          <p className="flex items-center justify-between gap-3 text-white/80">
            <span>Monthly Capacity</span>
            <span className="tabular font-medium text-white">{monthly}%</span>
          </p>
        </div>
      )}
    </span>
  );
}
