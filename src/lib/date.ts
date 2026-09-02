// The application's "current date" comes from the real system clock — there is no
// hardcoded demo date. Seed/historical data keeps its own literal dates; only the
// notion of "now" (today, overdue, due-soon, SLA windows, "last updated") is dynamic.

/** Start of the real current day (local time), time zeroed. Use everywhere the app
 * needs "today" for a calculation or a displayed current date. */
export function todayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** "26 Aug 2026"-style label for the real current day. */
export function todayLabel(): string {
  return formatDisplayDate(todayStart());
}

/** Real current date + time, for "last updated" style stamps. */
export function nowLabel(): string {
  const now = new Date();
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${formatDisplayDate(now)}, ${time}`;
}

export function parseLooseDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** `date` shifted by `days` (can be negative), time preserved. */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Whole days from `a` to `b` (b − a), rounded. */
export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

/** Stable `YYYY-MM-DD` key for a date (local), for grouping/lookups by day. */
export function dateKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Inverse of `dateKey` — midnight local on that day. */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** True when `date` is a working day (Sun–Thu; Fri/Sat are the weekend). */
export function isWorkingDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 5 && day !== 6;
}

/** Working days (the org week is Sun–Thu; Fri/Sat are the weekend) between `start`
 * and `end`, inclusive of both endpoints. 0 when `start` is after `end`. The one
 * shared definition of "how many working days are in this window" — used by capacity,
 * the deadline-driven daily-effort calculation, and the Handover planner alike. */
export function countWorkingDays(start: Date, end: Date): number {
  if (start > end) return 0;
  let count = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last) {
    const day = cursor.getDay();
    if (day !== 5 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

// ============================================================================
// Weeks — one Sunday-based scheme used everywhere in WorkLens. Sunday is the first
// day of a week; weeks are numbered 1–52 within the calendar year. Every chart,
// calendar and capacity calculation that talks about "weeks" goes through these two
// helpers so nothing can drift onto a different (e.g. Monday-based, or ISO-8601) system.
// ============================================================================

/** The Sunday that starts the week containing `date` (time zeroed, local). */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/** Calendar week number (1–52) for `date`, Sunday-based. Week 1 is the week that
 * contains 1 January; each later week begins on a Sunday. The trailing few days of
 * a 53-week year fold into week 52 so the value always stays within 1–52. */
export function weekOfYear(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.round((d.getTime() - jan1.getTime()) / 86_400_000) + 1;
  const week = Math.ceil((dayOfYear + jan1.getDay()) / 7);
  return Math.min(52, Math.max(1, week));
}

/** "W36"-style short week label, for chart axes. */
export function weekLabel(date: Date): string {
  return `W${weekOfYear(date)}`;
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Formats a Date (e.g. from a native `<input type="date">`) to match the
 * "26 Aug 2026" style used throughout the app's seed data. (Not using
 * `toLocaleDateString` here — the en-GB locale abbreviates September as
 * "Sept", four letters, inconsistent with every other month and with the
 * app's existing three-letter seed dates.) */
export function formatDisplayDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = SHORT_MONTHS[date.getMonth()];
  return `${day} ${month} ${date.getFullYear()}`;
}

/** Converts a "26 Aug 2026"-style label to the `YYYY-MM-DD` value a native
 * `<input type="date">` expects. Inverse of `formatDisplayDate`. */
export function toInputDateValue(label: string): string {
  const date = parseLooseDate(label);
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// ============================================================================
// SLA — a piece of work's due date always prefers an explicit deadline. With no
// deadline, the due date is derived from its priority's SLA window. Not editable.
// ============================================================================

export type SlaPriority = "High" | "Medium" | "Low";

/** SLA turnaround by priority, in hours: High → 24h, Medium → 1 week, Low → 1 month. */
export const SLA_HOURS: Record<SlaPriority, number> = {
  High: 24,
  Medium: 24 * 7,
  Low: 24 * 30,
};

export function slaHoursForPriority(priority: SlaPriority): number {
  return SLA_HOURS[priority];
}

/** Human-readable SLA window, e.g. "24 hours", "1 week", "1 month". */
export function slaWindowLabel(priority: SlaPriority): string {
  if (priority === "High") return "24 hours";
  if (priority === "Medium") return "1 week";
  return "1 month";
}

/** The date a piece of work is actually due. An explicit, parseable deadline always
 * wins. Otherwise it's `since` (the raised date, or today when absent) plus the
 * priority's SLA window. Always returns a concrete date. */
export function resolveDueDate(
  explicitDeadline: string | null | undefined,
  priority: SlaPriority,
  since?: string | null
): Date {
  const explicit = explicitDeadline ? parseLooseDate(explicitDeadline) : null;
  if (explicit) return explicit;
  const base = (since ? parseLooseDate(since) : null) ?? todayStart();
  return new Date(base.getTime() + slaHoursForPriority(priority) * 60 * 60 * 1000);
}

/** `resolveDueDate` as a "26 Aug 2026"-style label. */
export function resolveDueLabel(
  explicitDeadline: string | null | undefined,
  priority: SlaPriority,
  since?: string | null
): string {
  return formatDisplayDate(resolveDueDate(explicitDeadline, priority, since));
}

/** Whether the work's due date came from its SLA rather than an explicit deadline. */
export function isSlaDerived(explicitDeadline: string | null | undefined): boolean {
  return !explicitDeadline || !parseLooseDate(explicitDeadline);
}

export type DueStatus = "Overdue" | "Due Soon" | "On Track";

/** Due-soon window, in days, used to flag upcoming deadlines. */
const DUE_SOON_DAYS = 5;

export function getDueStatus(deadline: string): DueStatus {
  const date = parseLooseDate(deadline);
  if (!date) return "On Track";
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntil = Math.round((date.getTime() - todayStart().getTime()) / msPerDay);
  if (daysUntil < 0) return "Overdue";
  if (daysUntil <= DUE_SOON_DAYS) return "Due Soon";
  return "On Track";
}
