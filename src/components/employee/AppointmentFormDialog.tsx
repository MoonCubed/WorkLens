"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Employee } from "@/data/types";
import { useCalendarEvents, type CalendarEvent } from "@/store/calendar-events-store";
import { formatDisplayDate, toInputDateValue, todayLabel } from "@/lib/date";
import { withErrorDetail } from "@/lib/errorMessage";
import { minToTime, timeToMin, snapTime, slotMarks } from "@/lib/increments";

interface Draft {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
}

// Every calendar-event time is on the 30-minute grid. The picker offers half-hour
// marks across a generous day window rather than a free-text time field.
const TIME_MARKS = slotMarks(6 * 60, 21 * 60);

function draftFrom(event?: CalendarEvent | null): Draft {
  if (event) {
    return {
      title: event.title,
      date: toInputDateValue(event.date),
      startTime: snapTime(event.startTime ?? "09:00"),
      endTime: snapTime(event.endTime ?? "10:00"),
    };
  }
  return { title: "", date: toInputDateValue(todayLabel()), startTime: "09:00", endTime: "10:00" };
}

/**
 * The create/edit form for a time-based calendar event (an appointment / fixed
 * commitment). Owns its own persistence via the calendar-events store so it can be
 * opened from anywhere — the calendar page header ("Add"), or the appointments list.
 * A timed event occupies a real Start–End slot and reduces available capacity for
 * that day everywhere capacity is computed.
 */
export function AppointmentFormDialog({
  employee,
  event,
  onClose,
}: {
  employee: Employee;
  /** Pass an existing event to edit it; omit to create a new one. */
  event?: CalendarEvent | null;
  onClose: () => void;
}) {
  const { addEvent, updateEvent } = useCalendarEvents();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(event));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const title = draft.title.trim();
    if (!title || !draft.date) {
      setError("Give it a title and a date.");
      return;
    }
    const startTime = snapTime(draft.startTime);
    const endTime = snapTime(draft.endTime);
    if (timeToMin(endTime) <= timeToMin(startTime)) {
      setError("The end time has to be after the start time.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dateLabel = formatDisplayDate(new Date(`${draft.date}T00:00:00`));
      if (event) {
        await updateEvent(event.id, { title, date: dateLabel, startTime, endTime });
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
          startTime,
          endTime,
        });
      }
      onClose();
    } catch (err) {
      console.error("Failed to save the calendar event", err);
      setError(withErrorDetail("Couldn't save this event", err));
    } finally {
      setBusy(false);
    }
  }

  const durationH = (() => {
    const [sh, sm] = draft.startTime.split(":").map(Number);
    const [eh, em] = draft.endTime.split(":").map(Number);
    const mins = eh * 60 + em - (sh * 60 + sm);
    return mins > 0 ? Math.round((mins / 60) * 10) / 10 : 0;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/40 px-4 py-8"
      onClick={() => !busy && onClose()}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="my-auto w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface p-6 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{event ? "Edit event" : "Add calendar event"}</h2>
          <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Event title</span>
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
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            className="input"
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Start time</span>
            <select
              value={snapTime(draft.startTime)}
              onChange={(e) => {
                const v = e.target.value;
                setDraft((d) => ({ ...d, startTime: v, endTime: timeToMin(d.endTime) <= timeToMin(v) ? minToTime(timeToMin(v) + 30) : d.endTime }));
              }}
              className="input tabular"
            >
              {TIME_MARKS.map((m) => (
                <option key={m} value={minToTime(m)}>
                  {minToTime(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">End time</span>
            <select
              value={snapTime(draft.endTime)}
              onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))}
              className="input tabular"
            >
              {TIME_MARKS.filter((m) => m > timeToMin(draft.startTime)).map((m) => (
                <option key={m} value={minToTime(m)}>
                  {minToTime(m)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="text-xs text-ink-muted">
          {durationH > 0 ? `${durationH}h` : "This"} block occupies {snapTime(draft.startTime)}–{snapTime(draft.endTime)} on
          your calendar (30-minute steps) and reduces your available working time that day. It isn&rsquo;t a WorkLens task
          and doesn&rsquo;t change your working-hours profile.
        </p>
        {error && <p className="text-xs font-medium text-[var(--status-critical)]">{error}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-brand-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : event ? "Save changes" : "Add event"}
          </button>
        </div>
      </form>
    </div>
  );
}
