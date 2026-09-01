"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PriorityBadge } from "@/components/ui/StatusBadge";
import { todayStart, todayLabel, toInputDateValue, formatDisplayDate, startOfWeek, weekOfYear } from "@/lib/date";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type CalendarItemKind = "Ticket" | "Leave" | "Custom";
export type CalendarItemPriority = "High" | "Medium" | "Low";

export const CUSTOM_ITEM_TYPES = ["Task", "Meeting", "Reminder", "Personal", "Other"] as const;

export type TicketDeadlineState = "open" | "closed" | "overdue";

export interface CalendarItem {
  key: string;
  label: string;
  sublabel: string;
  kind: CalendarItemKind;
  date: Date;
  priority?: CalendarItemPriority;
  itemType?: string;
  note?: string;
  /** Only meaningful for kind "Ticket" — colors the deadline chip: open (blue),
   * closed/resolved (gray), or still open but past its deadline (red). */
  ticketState?: TicketDeadlineState;
  /** The ticket's own status (Open, In Progress, …) shown as extra context on the
   * week/day agenda cards — the closest thing to a "progress" indicator this data has. */
  status?: string;
  onClick?: () => void;
}

// Chip fills stay light so small text inside them stays readable; the legend swatch
// below uses a solid, fully-saturated color instead — the chip color alone was too
// pale to read as a legend key at a glance.
function chipStyle(item: CalendarItem): string {
  if (item.kind === "Ticket") {
    if (item.ticketState === "closed") return "bg-gray-100 border-gray-400 text-gray-600";
    if (item.ticketState === "overdue") return "bg-[var(--status-critical-bg)] border-[var(--status-critical-border)] text-[var(--status-critical)]";
    return "bg-brand-100 border-brand-600 text-brand-900";
  }
  if (item.kind === "Leave") return "bg-yellow-100 border-yellow-500 text-yellow-900";
  return "bg-purple-100 border-purple-600 text-purple-900";
}

const LEGEND: { label: string; dot: string }[] = [
  { label: "Ticket deadline (open)", dot: "bg-brand-600" },
  { label: "Ticket deadline (closed)", dot: "bg-gray-400" },
  { label: "Ticket deadline (overdue)", dot: "bg-[var(--status-critical)]" },
  { label: "Leave / unavailable", dot: "bg-yellow-500" },
  { label: "Added by you", dot: "bg-purple-600" },
];

// Overdue first, then leave, then ticket deadlines (High → Low), then custom items —
// so the most time-sensitive thing in a day is always the first chip you see.
const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
function itemSortRank(item: CalendarItem): number {
  if (item.kind === "Ticket" && item.ticketState === "overdue") return 0;
  if (item.kind === "Leave") return 1;
  if (item.kind === "Ticket") return 2 + (PRIORITY_RANK[item.priority ?? "Low"] ?? 2);
  return 6;
}
function sortItems(items: CalendarItem[]): CalendarItem[] {
  return [...items].sort((a, b) => itemSortRank(a) - itemSortRank(b));
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Inclusive date bounds of what the current view shows, for the period summary. */
function visibleRange(view: "month" | "week" | "day", cursor: Date): { start: Date; end: Date } {
  if (view === "day") return { start: cursor, end: cursor };
  if (view === "week") {
    const start = startOfWeek(cursor);
    return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6) };
  }
  return {
    start: new Date(cursor.getFullYear(), cursor.getMonth(), 1),
    end: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0),
  };
}

/** Shared month/week/day calendar, used by both the supervisor's and an employee's own
 * calendar. Callers resolve their own items (tickets, leave, personal entries) into a
 * flat `CalendarItem[]`; this component only handles layout, navigation and the
 * optional "add your own item" affordance. */
export function CalendarView({
  title,
  subtitle,
  items,
  onAddItem,
}: {
  title: string;
  subtitle: string;
  items: CalendarItem[];
  onAddItem?: (input: { title: string; date: string; priority: CalendarItemPriority; itemType: string; note: string }) => Promise<void>;
}) {
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [cursor, setCursor] = useState(() => todayStart());
  const [showAdd, setShowAdd] = useState(false);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    items.forEach((item) => {
      const key = dayKey(item.date);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    });
    for (const [key, list] of map) map.set(key, sortItems(list));
    return map;
  }, [items]);

  // Headline counts for whatever the current view is showing, so the user can size
  // up the period before scanning the grid.
  const periodSummary = useMemo(() => {
    const { start, end } = visibleRange(view, cursor);
    const inRange = items.filter((i) => i.date >= start && i.date <= end);
    return {
      deadlines: inRange.filter((i) => i.kind === "Ticket").length,
      overdue: inRange.filter((i) => i.kind === "Ticket" && i.ticketState === "overdue").length,
      leaveDays: inRange.filter((i) => i.kind === "Leave").length,
      personal: inRange.filter((i) => i.kind === "Custom").length,
    };
  }, [items, view, cursor]);

  function step(direction: 1 | -1) {
    setCursor((c) => {
      if (view === "month") return new Date(c.getFullYear(), c.getMonth() + direction, 1);
      if (view === "week") return new Date(c.getFullYear(), c.getMonth(), c.getDate() + direction * 7);
      return new Date(c.getFullYear(), c.getMonth(), c.getDate() + direction);
    });
  }

  function goToday() {
    setCursor(todayStart());
  }

  const headerLabel =
    view === "month"
      ? cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : view === "week"
        ? `Week ${weekOfYear(startOfWeek(cursor))} · from ${formatDisplayDate(startOfWeek(cursor))}`
        : formatDisplayDate(cursor);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        </div>
        {onAddItem && (
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryStat label={view === "month" ? "Deadlines this month" : view === "week" ? "Deadlines this week" : "Deadlines today"} value={periodSummary.deadlines} />
        <SummaryStat label="Overdue" value={periodSummary.overdue} tone={periodSummary.overdue > 0 ? "critical" : "neutral"} />
        <SummaryStat label="Leave days" value={periodSummary.leaveDays} tone={periodSummary.leaveDays > 0 ? "warning" : "neutral"} />
        <SummaryStat label="Added by you" value={periodSummary.personal} />
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-ink-secondary">
        {LEGEND.map(({ label, dot }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-full ${dot}`} />
            {label}
          </span>
        ))}
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">{headerLabel}</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-border-strong bg-surface p-1">
              {(["month", "week", "day"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                    view === v ? "bg-brand-800 text-white" : "text-ink-secondary hover:bg-brand-50"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => step(-1)}
                className="rounded-lg border border-border-strong p-1.5 text-ink-secondary hover:bg-brand-50"
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={goToday}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-brand-50"
              >
                Today
              </button>
              <button
                onClick={() => step(1)}
                className="rounded-lg border border-border-strong p-1.5 text-ink-secondary hover:bg-brand-50"
                aria-label="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {view === "month" && <MonthGrid cursor={cursor} itemsByDay={itemsByDay} />}
        {view === "week" && <WeekAgenda cursor={cursor} itemsByDay={itemsByDay} />}
        {view === "day" && <DayAgenda cursor={cursor} itemsByDay={itemsByDay} />}
      </Card>

      {showAdd && onAddItem && (
        <AddItemModal
          onClose={() => setShowAdd(false)}
          onSave={async (input) => {
            await onAddItem(input);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "critical" | "warning";
}) {
  const toneText =
    tone === "critical" && value > 0
      ? "text-[var(--status-critical)]"
      : tone === "warning" && value > 0
        ? "text-[var(--status-warning)]"
        : "text-ink";
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular ${toneText}`}>{value}</p>
    </div>
  );
}

function ItemChip({ item }: { item: CalendarItem }) {
  return (
    <div className="group relative">
      <div
        onClick={item.onClick}
        className={`truncate rounded border px-1.5 py-0.5 text-[10px] font-medium ${chipStyle(item)} ${item.onClick ? "cursor-pointer hover:brightness-95" : ""}`}
      >
        {item.label}
      </div>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-max max-w-[240px] -translate-x-1/2 rounded-lg bg-ink px-2.5 py-2 text-xs text-white shadow-lg group-hover:block">
        <p className="font-medium">{item.label}</p>
        <p className="text-ink-muted">
          {item.sublabel} · {item.itemType ?? item.kind}
          {item.status ? ` · ${item.status}` : ""}
          {item.priority ? ` · ${item.priority}` : ""}
        </p>
        {item.note && <p className="mt-1 text-ink-muted">{item.note}</p>}
      </div>
    </div>
  );
}

function MonthGrid({ cursor, itemsByDay }: { cursor: Date; itemsByDay: Map<string, CalendarItem[]> }) {
  const weeks = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const startOffset = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cursor]);

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
      {WEEKDAYS.map((d) => (
        <div key={d} className="bg-brand-50/60 px-2 py-1.5 text-center font-medium uppercase tracking-wide text-ink-secondary">
          {d}
        </div>
      ))}
      {weeks.flatMap((week, wi) =>
        week.map((date, di) => {
          const key = date ? dayKey(date) : `blank-${wi}-${di}`;
          const dayItems = date ? itemsByDay.get(key) ?? [] : [];
          const isToday = date ? isSameDay(date, todayStart()) : false;
          const hasOverdue = dayItems.some((i) => i.kind === "Ticket" && i.ticketState === "overdue");
          const visible = dayItems.slice(0, 3);
          return (
            <div
              key={key}
              className={`min-h-[104px] bg-surface p-1.5 ${date ? "" : "bg-brand-50/20"} ${
                hasOverdue ? "border-l-2 border-[var(--status-critical)]" : ""
              }`}
            >
              {date && (
                <>
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs tabular ${
                        isToday ? "bg-brand-800 font-semibold text-white" : "text-ink-secondary"
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    {dayItems.length > 0 && (
                      <span className="text-[10px] font-medium text-ink-muted">{dayItems.length}</span>
                    )}
                  </div>
                  <div className="mt-1 space-y-1">
                    {visible.map((item) => (
                      <ItemChip key={item.key} item={item} />
                    ))}
                    {dayItems.length > 3 && <p className="px-1 text-[10px] text-ink-muted">+{dayItems.length - 3} more</p>}
                  </div>
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function WeekAgenda({ cursor, itemsByDay }: { cursor: Date; itemsByDay: Map<string, CalendarItem[]> }) {
  const days = useMemo(() => {
    const start = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [cursor]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((date) => (
        <DayColumn key={dayKey(date)} date={date} items={itemsByDay.get(dayKey(date)) ?? []} />
      ))}
    </div>
  );
}

function DayAgenda({ cursor, itemsByDay }: { cursor: Date; itemsByDay: Map<string, CalendarItem[]> }) {
  return (
    <div className="max-w-md">
      <DayColumn date={cursor} items={itemsByDay.get(dayKey(cursor)) ?? []} expanded />
    </div>
  );
}

function DayColumn({ date, items, expanded }: { date: Date; items: CalendarItem[]; expanded?: boolean }) {
  const isToday = isSameDay(date, todayStart());
  return (
    <div className={`rounded-lg border p-2.5 ${isToday ? "border-brand-500 bg-brand-50/30" : "border-border"}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${isToday ? "text-brand-700" : "text-ink-secondary"}`}>
        {WEEKDAYS[date.getDay()]} {date.getDate()}
      </p>
      <div className={`mt-2 space-y-1.5 ${expanded ? "" : "min-h-[60px]"}`}>
        {items.length === 0 ? (
          <p className="text-xs text-ink-muted">Nothing scheduled.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.key}
              onClick={item.onClick}
              className={`rounded-lg border px-2.5 py-2 text-xs ${chipStyle(item)} ${item.onClick ? "cursor-pointer hover:brightness-95" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{item.label}</p>
                {item.priority && <PriorityBadge priority={item.priority} />}
              </div>
              <p className="mt-0.5 opacity-80">
                {item.sublabel} · {item.itemType ?? item.kind}
                {item.status ? ` · ${item.status}` : ""}
              </p>
              {item.kind === "Ticket" && item.ticketState === "overdue" && (
                <p className="mt-1 font-semibold text-[var(--status-critical)]">Overdue</p>
              )}
              {item.note && <p className="mt-1 opacity-80">{item.note}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AddItemModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (input: { title: string; date: string; priority: CalendarItemPriority; itemType: string; note: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => toInputDateValue(todayLabel()));
  const [priority, setPriority] = useState<CalendarItemPriority>("Medium");
  const [itemType, setItemType] = useState<string>(CUSTOM_ITEM_TYPES[0]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-8 overflow-y-auto">
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-lg my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">Add to Calendar</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-3.5 py-2.5 text-xs text-[var(--status-critical)]">
            {error}
          </p>
        )}

        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim() || !date || submitting) return;
            setSubmitting(true);
            setError(null);
            try {
              await onSave({
                title: title.trim(),
                date: formatDisplayDate(new Date(`${date}T00:00:00`)),
                priority,
                itemType,
                note: note.trim(),
              });
            } catch {
              setError("Couldn't save this — check your connection and try again.");
              setSubmitting(false);
            }
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" required autoFocus />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value as CalendarItemPriority)} className="input">
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Type</span>
            <select value={itemType} onChange={(e) => setItemType(e.target.value)} className="input">
              {CUSTOM_ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">
              Note / Description
            </span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="input resize-none" />
          </label>
          <p className="text-xs text-ink-muted">Only visible to you.</p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-brand-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
