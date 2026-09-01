import { todayStart, startOfWeek, weekOfYear } from "@/lib/date";

/** Turns a run of week-by-week utilization values into chart rows, numbering the
 * weeks with the app-wide Sunday-based 1–52 scheme (see `weekOfYear` in lib/date).
 * `from` defaults to the current week. */
export function toWeekSeries(values: number[], from: Date = todayStart()) {
  const weekStart = startOfWeek(from);
  return values.map((utilization, i) => {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i * 7);
    return { week: `Week ${weekOfYear(d)}`, utilization };
  });
}
