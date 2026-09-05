// The employee's contracted working window for a day, parsed from their
// `workingSchedule` string ("Sun–Thu 07:00–16:00"). Shared by every hour-precision
// view (Plan My Day, the Workload day timeline) so the clock bounds never drift.

import type { Employee } from "@/data/types";

/** Parse a loose clock string ("07:00", "4:00 PM", "16:00") to minutes since midnight. */
export function parseClock(text: string, fallback: number): number {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(text ?? "");
  if (!m) return fallback;
  let h = Number(m[1]) % 12;
  if (m[3] && m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

/** The employee's working-day bounds in minutes since midnight (default 07:00–16:00). */
export function workingWindow(employee: Pick<Employee, "workingSchedule">): { startMin: number; endMin: number } {
  const [startText, endText] = (employee.workingSchedule || "").split("–").slice(-2);
  const startMin = parseClock(startText ?? "", 7 * 60);
  const endMin = Math.max(startMin + 60, parseClock(endText ?? "", 16 * 60));
  return { startMin, endMin };
}
