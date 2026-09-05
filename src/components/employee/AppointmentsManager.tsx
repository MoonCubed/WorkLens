"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import type { Employee } from "@/data/types";
import { useCalendarEvents, isTimedEvent, type CalendarEvent } from "@/store/calendar-events-store";
import { calendarEventHours } from "@/lib/capacityEngine";
import { parseLooseDate, startOfWeek, endOfWeek } from "@/lib/date";
import { withErrorDetail } from "@/lib/errorMessage";
import { AppointmentFormDialog } from "@/components/employee/AppointmentFormDialog";

/**
 * Employee calendar events / appointments — time the employee is unavailable for
 * normal task work (a doctor's appointment, a fixed meeting, …). These are not
 * WorkLens tasks and they never touch the official working-hours profile; each timed
 * event just reduces available capacity for that day, everywhere capacity is shown.
 *
 * `openNonce` — bump it (e.g. from the calendar page's "Add" button) to pop the
 * create form open from outside this card.
 */
export function AppointmentsManager({ employee, openNonce = 0 }: { employee: Employee; openNonce?: number }) {
  const { events, deleteEvent } = useCalendarEvents();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seenNonce, setSeenNonce] = useState(openNonce);

  if (openNonce !== seenNonce) {
    setSeenNonce(openNonce);
    setEditing(null);
    setAdding(true);
  }

  const mine = useMemo(
    () =>
      events
        .filter((e) => e.authorId === employee.id && isTimedEvent(e))
        .sort((a, b) => {
          const da = parseLooseDate(a.date)?.getTime() ?? 0;
          const db = parseLooseDate(b.date)?.getTime() ?? 0;
          return da - db || (a.startTime ?? "").localeCompare(b.startTime ?? "");
        }),
    [events, employee.id]
  );

  const thisWeekHours = useMemo(() => {
    const ws = startOfWeek(new Date());
    const we = endOfWeek(new Date());
    return (
      Math.round(
        mine
          .filter((e) => {
            const d = parseLooseDate(e.date);
            return d && d >= ws && d <= we;
          })
          .reduce((s, e) => s + calendarEventHours(e), 0) * 10
      ) / 10
    );
  }, [mine]);

  async function remove(id: string) {
    setError(null);
    try {
      await deleteEvent(id);
    } catch (err) {
      console.error("Failed to delete the appointment", err);
      setError(withErrorDetail("Couldn't delete this appointment", err));
    }
  }

  return (
    <Card>
      <CardHeader
        title="My Appointments"
        subtitle="Personal time you're unavailable for task work — reduces your available capacity, without changing your working-hours profile."
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          {mine.length} appointment{mine.length === 1 ? "" : "s"}
          {thisWeekHours > 0 && ` · ${thisWeekHours}h this week`}
        </p>
        <button
          onClick={() => {
            setEditing(null);
            setAdding(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-brand-50"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Add appointment
        </button>
      </div>

      {error && <p className="mb-3 text-xs font-medium text-[var(--status-critical)]">{error}</p>}

      {mine.length === 0 ? (
        <p className="py-3 text-sm text-ink-muted">No appointments yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {mine.map((ev) => (
            <li key={ev.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700">
                  <CalendarClock className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{ev.title}</p>
                  <p className="text-xs text-ink-muted">
                    {ev.date} · {ev.startTime}–{ev.endTime} · {calendarEventHours(ev)}h
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => {
                    setAdding(false);
                    setEditing(ev);
                  }}
                  className="rounded-lg border border-border-strong bg-surface p-1.5 text-ink-secondary hover:bg-brand-50"
                  aria-label={`Edit ${ev.title}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => remove(ev.id)}
                  className="rounded-lg border border-border-strong bg-surface p-1.5 text-ink-secondary hover:bg-brand-50"
                  aria-label={`Delete ${ev.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(adding || editing) && (
        <AppointmentFormDialog
          employee={employee}
          event={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}
