"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import type { Employee } from "@/data/types";
import { useCalendarEvents, isTimedEvent } from "@/store/calendar-events-store";
import { calendarEventHours } from "@/lib/capacityEngine";
import { formatDisplayDate, parseLooseDate, toInputDateValue, todayLabel, startOfWeek, endOfWeek } from "@/lib/date";

interface Draft {
  id: string | null;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
}

const EMPTY_DRAFT: Draft = { id: null, title: "", date: toInputDateValue(todayLabel()), startTime: "09:00", endTime: "10:00" };

/**
 * Employee calendar events / appointments — time the employee is unavailable for
 * normal task work (a doctor's appointment, a fixed meeting, …). These are not
 * WorkLens tasks and they never touch the official working-hours profile; each timed
 * event just reduces available capacity for that day, everywhere capacity is shown.
 */
export function AppointmentsManager({ employee }: { employee: Employee }) {
  const { events, addEvent, updateEvent, deleteEvent } = useCalendarEvents();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function save() {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title || !draft.date || draft.endTime <= draft.startTime) {
      setError("Give it a title and an end time after the start time.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dateLabel = formatDisplayDate(new Date(`${draft.date}T00:00:00`));
      if (draft.id) {
        await updateEvent(draft.id, {
          title,
          date: dateLabel,
          startTime: draft.startTime,
          endTime: draft.endTime,
        });
      } else {
        await addEvent({
          authorId: employee.id,
          authorName: employee.name,
          authorRole: "employee",
          department: employee.department,
          title,
          date: dateLabel,
          priority: "Medium",
          itemType: "Appointment",
          note: "",
          startTime: draft.startTime,
          endTime: draft.endTime,
        });
      }
      setDraft(null);
    } catch {
      setError("Couldn't save this appointment — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await deleteEvent(id);
    } catch {
      setError("Couldn't delete this appointment — check your connection and try again.");
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
          onClick={() => setDraft({ ...EMPTY_DRAFT })}
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
                  onClick={() =>
                    setDraft({
                      id: ev.id,
                      title: ev.title,
                      date: toInputDateValue(ev.date),
                      startTime: ev.startTime ?? "09:00",
                      endTime: ev.endTime ?? "10:00",
                    })
                  }
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

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/40 px-4 py-8" onClick={() => setDraft(null)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="my-auto w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface p-6 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">{draft.id ? "Edit appointment" : "Add appointment"}</h2>
              <button type="button" onClick={() => setDraft(null)} className="text-ink-muted hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Title</span>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="input"
                placeholder="Doctor Appointment"
                required
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Date</span>
              <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="input" required />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Start time</span>
                <input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} className="input" required />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">End time</span>
                <input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} className="input" required />
              </label>
            </div>

            <p className="text-xs text-ink-muted">
              Reduces your available capacity for that day. Not a WorkLens task; doesn&rsquo;t change your working hours.
            </p>
            {error && <p className="text-xs font-medium text-[var(--status-critical)]">{error}</p>}

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-brand-50">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </Card>
  );
}
