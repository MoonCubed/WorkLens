"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatDisplayDate, parseLooseDate, todayStart, startOfWeek, weekOfYear } from "@/lib/date";

type View = "month" | "week" | "day";

/** One leave period to place on the timeline. Callers resolve these from the same
 * sources HR's leave list uses — approved `leaveEvents` plus pending handover/leave
 * requests — so the calendar tracks every create / approve / decline / date change
 * automatically. */
export interface CalendarLeave {
  key: string;
  employeeId: string;
  employeeName: string;
  type: string;
  start: string;
  end: string;
  status: "Approved" | "Pending";
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MS_PER_DAY = 86_400_000;
// Minimum width per day column, per view — keeps month scannable while letting
// week/day breathe. The grid scrolls horizontally below these widths.
const MIN_COL: Record<View, number> = { month: 30, week: 88, day: 240 };
const NAME_COL = 184;
const LANE_HEIGHT = 30;

function ymd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function diffDays(a: Date, b: Date): number {
  return Math.round((ymd(a).getTime() - ymd(b).getTime()) / MS_PER_DAY);
}
function isWeekend(d: Date): boolean {
  // The org works Sun–Thu (see the HR schedule) — Fri/Sat read as the weekend.
  return d.getDay() === 5 || d.getDay() === 6;
}

function viewDays(view: View, cursor: Date): Date[] {
  if (view === "day") return [ymd(cursor)];
  if (view === "week") {
    const s = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => new Date(year, month, i + 1));
}

interface Segment extends CalendarLeave {
  startIdx: number;
  endIdx: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  lane: number;
}

/** Greedy lane packing so two leave blocks in the same row (e.g. an approved
 * leave and a separate pending request) never sit on top of each other. */
function packLanes(items: Omit<Segment, "lane">[]): Segment[] {
  const sorted = [...items].sort((a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx);
  const laneEnds: number[] = [];
  return sorted.map((it) => {
    let lane = laneEnds.findIndex((end) => end < it.startIdx);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = it.endIdx;
    return { ...it, lane };
  });
}

/** Visual employee leave calendar — one employee per row, dates across the top,
 * each leave drawn as a timeline block. Replaces HR's old leave table. */
export function EmployeeLeaveCalendar({
  leaves,
  employees,
}: {
  leaves: CalendarLeave[];
  employees: { id: string; name: string }[];
}) {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<Date>(() => todayStart());
  const today = todayStart();

  const days = useMemo(() => viewDays(view, cursor), [view, cursor]);
  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];

  const segmentsByEmployee = useMemo(() => {
    const raw: Omit<Segment, "lane">[] = leaves.flatMap((lv) => {
      const s = parseLooseDate(lv.start);
      const e = parseLooseDate(lv.end);
      if (!s || !e) return [];
      const start = ymd(s);
      const end = ymd(e);
      if (end < rangeStart || start > rangeEnd) return [];
      return [
        {
          ...lv,
          startIdx: Math.max(0, diffDays(start, rangeStart)),
          endIdx: Math.min(days.length - 1, diffDays(end, rangeStart)),
          clippedStart: start < rangeStart,
          clippedEnd: end > rangeEnd,
        },
      ];
    });
    const map = new Map<string, Segment[]>();
    const byEmp = new Map<string, Omit<Segment, "lane">[]>();
    raw.forEach((seg) => {
      const list = byEmp.get(seg.employeeId) ?? [];
      list.push(seg);
      byEmp.set(seg.employeeId, list);
    });
    for (const [id, list] of byEmp) map.set(id, packLanes(list));
    return map;
  }, [leaves, days.length, rangeStart, rangeEnd]);

  // People on leave per visible day → make overlapping leave obvious.
  const perDayCount = useMemo(
    () =>
      days.map((_, i) => {
        const people = new Set<string>();
        for (const segs of segmentsByEmployee.values()) {
          for (const seg of segs) {
            if (i >= seg.startIdx && i <= seg.endIdx) people.add(seg.employeeId);
          }
        }
        return people.size;
      }),
    [days, segmentsByEmployee]
  );
  const overlapDays = perDayCount.filter((c) => c >= 2).length;
  const peopleOnLeave = segmentsByEmployee.size;

  function step(dir: 1 | -1) {
    setCursor((c) => {
      if (view === "month") return new Date(c.getFullYear(), c.getMonth() + dir, 1);
      if (view === "week") return addDays(c, dir * 7);
      return addDays(c, dir);
    });
  }

  const periodLabel =
    view === "month"
      ? cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : view === "week"
        ? `Week ${weekOfYear(startOfWeek(cursor))} · from ${formatDisplayDate(startOfWeek(cursor))}`
        : formatDisplayDate(ymd(cursor));

  const gridMinWidth = NAME_COL + days.length * MIN_COL[view];

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => step(-1)}
              aria-label="Previous period"
              className="rounded-lg border border-border-strong p-1.5 text-ink-secondary hover:bg-brand-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCursor(todayStart())}
              className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-brand-50"
            >
              Today
            </button>
            <button
              onClick={() => step(1)}
              aria-label="Next period"
              className="rounded-lg border border-border-strong p-1.5 text-ink-secondary hover:bg-brand-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <h2 className="text-base font-semibold text-ink">{periodLabel}</h2>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border-strong bg-surface p-1">
          {(["month", "week", "day"] as View[]).map((v) => (
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
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border px-4 py-2.5 text-xs text-ink-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-l-[3px] border-[var(--status-good-border)] border-l-[var(--status-good)] bg-[var(--status-good-bg)]" />
          Approved
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-dashed border-[var(--status-warning)] bg-[var(--status-warning-bg)]" />
          Pending approval
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-[var(--status-serious-bg)] ring-1 ring-inset ring-[var(--status-serious-border)]" />
          Overlapping leave
        </span>
        <span className="ml-auto text-ink-muted">
          {peopleOnLeave} on leave · {overlapDays} overlap day{overlapDays === 1 ? "" : "s"} this {view}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: gridMinWidth }}>
          {/* Header */}
          <div className="flex border-b border-border">
            <div
              style={{ width: NAME_COL }}
              className="sticky left-0 z-10 shrink-0 bg-brand-50/60 px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-secondary"
            >
              Employee
            </div>
            <div className="flex flex-1 bg-brand-50/40">
              {days.map((d, i) => {
                const todayCol = isSameDay(d, today);
                return (
                  <div
                    key={i}
                    className={`flex-1 border-l border-border px-1 py-1.5 text-center ${
                      isWeekend(d) ? "bg-brand-50/70" : ""
                    } ${todayCol ? "bg-brand-100" : ""}`}
                  >
                    <div className="text-[10px] uppercase text-ink-muted">{WEEKDAYS[d.getDay()]}</div>
                    <div className={`text-xs tabular ${todayCol ? "font-semibold text-brand-800" : "text-ink-secondary"}`}>
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Employee rows */}
          {employees.map((emp) => {
            const segs = segmentsByEmployee.get(emp.id) ?? [];
            const laneCount = Math.max(1, ...segs.map((s) => s.lane + 1));
            return (
              <div key={emp.id} className="flex border-b border-border last:border-0">
                <div
                  style={{ width: NAME_COL }}
                  className="sticky left-0 z-10 shrink-0 bg-surface px-4 py-2.5 text-sm font-medium text-ink"
                >
                  {emp.name}
                </div>
                <div className="relative flex-1">
                  <div className="absolute inset-0 flex">
                    {days.map((d, i) => (
                      <div
                        key={i}
                        className={`flex-1 border-l border-border ${isWeekend(d) ? "bg-brand-50/40" : ""} ${
                          isSameDay(d, today) ? "bg-brand-100/50" : ""
                        }`}
                      />
                    ))}
                  </div>
                  <div className="relative" style={{ minHeight: laneCount * LANE_HEIGHT + 12 }}>
                    {segs.map((seg) => {
                      const left = (seg.startIdx / days.length) * 100;
                      const width = ((seg.endIdx - seg.startIdx + 1) / days.length) * 100;
                      const approved = seg.status === "Approved";
                      return (
                        <div
                          key={seg.key}
                          title={`${seg.employeeName} · ${seg.type} · ${seg.start} – ${seg.end} · ${seg.status}`}
                          style={{
                            left: `${left}%`,
                            width: `calc(${width}% - 4px)`,
                            marginLeft: 2,
                            top: seg.lane * LANE_HEIGHT + 6,
                          }}
                          className={`absolute flex h-[26px] items-center overflow-hidden whitespace-nowrap rounded-md px-2 text-[11px] font-medium ${
                            approved
                              ? "border border-l-[3px] border-[var(--status-good-border)] border-l-[var(--status-good)] bg-[var(--status-good-bg)] text-[var(--status-good)]"
                              : "border border-dashed border-[var(--status-warning)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]"
                          }`}
                        >
                          {seg.clippedStart && <span className="mr-0.5 shrink-0">‹</span>}
                          <span className="truncate">
                            {seg.type}
                            {approved ? "" : " · pending"}
                          </span>
                          {seg.clippedEnd && <span className="ml-0.5 shrink-0">›</span>}
                        </div>
                      );
                    })}
                    {segs.length === 0 && (
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-ink-muted/60">
                        Available
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Coverage / overlap strip */}
          <div className="flex border-t border-border bg-surface">
            <div
              style={{ width: NAME_COL }}
              className="sticky left-0 z-10 shrink-0 bg-surface px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-ink-muted"
            >
              On leave / day
            </div>
            <div className="flex flex-1">
              {days.map((d, i) => {
                const count = perDayCount[i];
                return (
                  <div
                    key={i}
                    className={`flex-1 border-l border-border py-1.5 text-center text-[11px] tabular ${
                      count >= 2
                        ? "bg-[var(--status-serious-bg)] font-semibold text-[var(--status-serious)]"
                        : count === 1
                          ? "text-ink-secondary"
                          : "text-ink-muted/40"
                    } ${isSameDay(d, today) ? "ring-1 ring-inset ring-brand-100" : ""}`}
                  >
                    {count || "·"}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {peopleOnLeave === 0 && (
        <p className="px-4 py-6 text-center text-sm text-ink-muted">
          No leave recorded for this {view}. Use the controls above to look at another period.
        </p>
      )}
    </Card>
  );
}
