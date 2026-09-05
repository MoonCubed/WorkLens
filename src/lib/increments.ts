// The smallest unit WorkLens lets anyone plan or schedule work in is 30 minutes.
// Every user-facing hours field, time picker and Plan-My-Day block snaps to this so
// the whole product stays on the same grid (08:00 / 08:30 / 09:00 …, 1h / 1.5h / 2h).
// The automatic even-spread distribution in the capacity engine is display-rounded
// elsewhere and is not a user input, so it isn't forced onto this grid.

export const SLOT_MINUTES = 30;
/** 30 minutes expressed in hours. */
export const SLOT_HOURS = 0.5;

/** Round an hours value to the nearest 30-minute increment. */
export function snapHours(hours: number): number {
  if (!Number.isFinite(hours)) return 0;
  return Math.round(hours / SLOT_HOURS) * SLOT_HOURS;
}

/** Minutes since midnight → "HH:MM" (24h). */
export function minToTime(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:MM" → minutes since midnight (0 when unparseable). */
export function timeToMin(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** Round a "HH:MM" string to the nearest 30-minute mark, clamped to the day. */
export function snapTime(value: string): string {
  const snapped = Math.round(timeToMin(value) / SLOT_MINUTES) * SLOT_MINUTES;
  return minToTime(Math.max(0, Math.min(24 * 60 - SLOT_MINUTES, snapped)));
}

/** All 30-minute marks in `[startMin, endMin]` (inclusive), aligned to the half hour. */
export function slotMarks(startMin: number, endMin: number): number[] {
  const out: number[] = [];
  for (let m = Math.ceil(startMin / SLOT_MINUTES) * SLOT_MINUTES; m <= endMin; m += SLOT_MINUTES) {
    out.push(m);
  }
  return out;
}
