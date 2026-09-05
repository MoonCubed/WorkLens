"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Sparkles, X, Check, Info, AlertTriangle, Wand2, CheckCircle2 } from "lucide-react";
import type { Employee } from "@/data/types";
import { useTickets } from "@/store/tickets-store";
import { useWorkLog } from "@/store/work-log-store";
import { useCalendarEvents } from "@/store/calendar-events-store";
import { useDayPlans, type DayPlan, type DayPlanAllocation, type DayPlanConfirm } from "@/store/day-plans-store";
import {
  buildPlanRecommendations,
  buildDayFrame,
  autoArrange,
  type PlanRecommendation,
  type DayFrame,
} from "@/lib/planDay";
import { computeEmployeeSchedule, computeEmployeeCapacity, computeEmployeeWorkItems, type ScheduledWorkItem } from "@/lib/capacityEngine";
import { todayStart, isWorkingDay, addDays, formatDisplayDate, relativeDayLabel, getDueStatus } from "@/lib/date";
import { SLOT_MINUTES, snapHours, minToTime, timeToMin, slotMarks } from "@/lib/increments";
import { withErrorDetail } from "@/lib/errorMessage";

const REC_STYLE: Record<PlanRecommendation["tone"], { icon: typeof Info; cls: string }> = {
  info: { icon: Info, cls: "border-brand-100 bg-brand-50 text-brand-800" },
  warn: { icon: AlertTriangle, cls: "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]" },
  critical: { icon: AlertTriangle, cls: "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical)]" },
};

/**
 * "Plan My Day" — the employee lays their chosen tasks into real time blocks for the
 * day (08:00–10:00 · Task A), on the 30-minute grid, around their working hours, the
 * 11:30–12:30 lunch break and any timed calendar events. The confirmed plan is saved
 * to `day_plans` and shown, unchanged, on the employee's and their supervisor's
 * Workload calendar. At the end of the day the same dialog collects what was actually
 * worked and adds it to each task's actual effort. It never touches
 * supervisor-controlled task fields (priority, deadline, skills, assignment).
 */
export function PlanMyDay({ employee, onOpenTicket }: { employee: Employee; onOpenTicket?: (id: string) => void }) {
  const { getPlan } = useDayPlans();
  const [open, setOpen] = useState(false);

  const dateKey = useMemo(() => {
    let d = todayStart();
    while (!isWorkingDay(d)) d = addDays(d, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const existing = getPlan(employee.id, dateKey);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-brand-50"
      >
        <Sparkles className="h-4 w-4 text-brand-700" strokeWidth={1.75} />
        Plan My Day
        {existing?.confirmedAt ? (
          <span className="ml-1 rounded-full bg-[var(--status-good-bg)] px-1.5 text-[11px] font-semibold text-[var(--status-good)]">confirmed</span>
        ) : existing ? (
          <span className="ml-1 rounded-full bg-brand-100 px-1.5 text-[11px] font-semibold text-brand-700">saved</span>
        ) : null}
      </button>
      {open && <PlanMyDayModal employee={employee} onOpenTicket={onOpenTicket} onClose={() => setOpen(false)} />}
    </>
  );
}

interface Block {
  startMin: number;
  endMin: number;
}

function PlanMyDayModal({
  employee,
  onOpenTicket,
  onClose,
}: {
  employee: Employee;
  onOpenTicket?: (id: string) => void;
  onClose: () => void;
}) {
  const { tickets } = useTickets();
  const { getEntry, setEffort } = useWorkLog();
  const { events } = useCalendarEvents();
  const { getPlan, savePlan, patchPlan, clearPlan } = useDayPlans();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"plan" | "confirm">("plan");

  const day = useMemo(() => {
    let d = todayStart();
    while (!isWorkingDay(d)) d = addDays(d, 1);
    return d;
  }, []);
  const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;

  const { schedule, capacity, frame, candidates, staleTitles } = useMemo(() => {
    const sch = computeEmployeeSchedule(employee, tickets, getEntry, events);
    const cap = computeEmployeeCapacity(employee, tickets, getEntry, events);
    const fr = buildDayFrame(employee, tickets, getEntry, events, day);
    const workItems = computeEmployeeWorkItems(employee, tickets, getEntry, events);
    const cands = sch.activeItems
      .filter((i) => i.remainingHours > 0 && !i.blockedByDependency)
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.deadline.getTime() - b.deadline.getTime());
    const stale = workItems
      .filter((w) => w.status !== "Completed" && w.progressUpdatedAt)
      .filter((w) => {
        const l = relativeDayLabel(w.progressUpdatedAt) ?? "";
        return /days ago/.test(l) && !/^[1-4] /.test(l);
      })
      .map((w) => w.title);
    return { schedule: sch, capacity: cap, frame: fr, candidates: cands, staleTitles: stale };
  }, [employee, tickets, getEntry, events, day]);

  const existing = getPlan(employee.id, dateKey);
  const candByKey = useMemo(() => new Map(candidates.map((c) => [c.key, c])), [candidates]);

  // Time marks available for the start / end dropdowns (whole working window).
  const marks = useMemo(() => slotMarks(frame.workStartMin, frame.workEndMin), [frame]);

  // blocks: schedule-item key -> its time block, or absent = not included today.
  const [blocks, setBlocks] = useState<Record<string, Block>>(() => {
    const seed: Record<string, Block> = {};
    if (existing) {
      existing.allocations
        .filter((a) => !a.key.startsWith("manual") && a.startTime && a.endTime)
        .forEach((a) => (seed[a.key] = { startMin: timeToMin(a.startTime!), endMin: timeToMin(a.endTime!) }));
      return seed;
    }
    // Fresh plan → auto-arrange the top-priority tasks into the day's free time.
    const items = candidates
      .filter((c) => c.remainingHours > 0)
      .map((c) => ({ key: c.key, minutes: Math.round(snapHours(c.dailyHours > 0 ? c.dailyHours : c.remainingHours) * 60) }))
      .filter((it) => it.minutes >= SLOT_MINUTES);
    const { placed } = autoArrange(frame, items);
    placed.forEach((p) => (seed[p.key] = { startMin: p.startMin, endMin: p.endMin }));
    return seed;
  });

  const [manual, setManual] = useState<{ label: string; block: Block | null }>(() => {
    const m = existing?.allocations.find((a) => a.key.startsWith("manual"));
    return m && m.startTime && m.endTime
      ? { label: m.title, block: { startMin: timeToMin(m.startTime), endMin: timeToMin(m.endTime) } }
      : { label: "Admin / catch-up", block: null };
  });

  const included = useMemo(
    () =>
      Object.entries(blocks)
        .filter(([key]) => candByKey.has(key))
        .map(([key, b]) => ({ key, item: candByKey.get(key)!, ...b }))
        .sort((a, b) => a.startMin - b.startMin),
    [blocks, candByKey]
  );

  // Every block (tasks + manual), for overlap checks.
  const allBlocks = useMemo(() => {
    const list = included.map((b) => ({ id: b.key, startMin: b.startMin, endMin: b.endMin, title: b.item.title }));
    if (manual.block) list.push({ id: "manual", startMin: manual.block.startMin, endMin: manual.block.endMin, title: manual.label || "Commitment" });
    return list;
  }, [included, manual]);

  /** Why a given block is invalid, or null. */
  function blockProblem(id: string, startMin: number, endMin: number): string | null {
    if (endMin <= startMin) return "End must be after start";
    if (startMin < frame.workStartMin || endMin > frame.workEndMin) return "Outside working hours";
    const insideFree = frame.free.some((g) => startMin >= g.startMin && endMin <= g.endMin);
    if (!insideFree) {
      const hitsLunch = startMin < 12 * 60 + 30 && endMin > 11 * 60 + 30;
      return hitsLunch ? "Overlaps the 11:30–12:30 lunch break" : "Overlaps a calendar event or a break";
    }
    const clash = allBlocks.find((b) => b.id !== id && startMin < b.endMin && endMin > b.startMin);
    if (clash) return `Overlaps “${clash.title}”`;
    return null;
  }

  const problems = allBlocks
    .map((b) => ({ id: b.id, title: b.title, problem: blockProblem(b.id, b.startMin, b.endMin) }))
    .filter((p) => p.problem);

  const hoursByKey = useMemo(() => {
    const out: Record<string, number> = {};
    included.forEach((b) => (out[b.key] = Math.round(((b.endMin - b.startMin) / 60) * 10) / 10));
    return out;
  }, [included]);

  const manualHours = manual.block ? Math.round(((manual.block.endMin - manual.block.startMin) / 60) * 10) / 10 : 0;
  const taskTotal = Object.values(hoursByKey).reduce((s, h) => s + h, 0);
  const total = Math.round((taskTotal + manualHours) * 10) / 10;
  const available = frame.availableHours;
  const remaining = Math.round((available - total) * 10) / 10;

  const recs = useMemo(
    () => buildPlanRecommendations(schedule, capacity, { selectedHoursByKey: hoursByKey, availableHours: available, manualHours, staleTitles }),
    [schedule, capacity, hoursByKey, available, manualHours, staleTitles]
  );

  function toggleTask(c: ScheduledWorkItem) {
    setBlocks((prev) => {
      const next = { ...prev };
      if (next[c.key]) {
        delete next[c.key];
        return next;
      }
      // Place a new block in the first free interval with room (auto-arrange, one task).
      const minutes = Math.max(SLOT_MINUTES, Math.round(snapHours(c.dailyHours > 0 ? c.dailyHours : c.remainingHours) * 60));
      const taken = Object.values(next).concat(manual.block ? [manual.block] : []);
      const slot = findOpenSlot(frame, taken, minutes);
      next[c.key] = slot ?? { startMin: frame.workStartMin, endMin: Math.min(frame.workEndMin, frame.workStartMin + minutes) };
      return next;
    });
  }

  function setBlockTime(key: string, part: "start" | "end", value: number) {
    setBlocks((prev) => {
      const b = prev[key];
      if (!b) return prev;
      const next = { ...b };
      if (part === "start") {
        next.startMin = value;
        if (next.endMin <= value) next.endMin = value + SLOT_MINUTES;
      } else {
        next.endMin = value;
      }
      return { ...prev, [key]: next };
    });
  }

  function autoArrangeAll() {
    const items = (included.length > 0 ? included.map((b) => b.item) : candidates)
      .map((c) => ({ key: c.key, minutes: Math.max(SLOT_MINUTES, Math.round(snapHours(c.dailyHours > 0 ? c.dailyHours : c.remainingHours) * 60)) }));
    const { placed } = autoArrange(frame, items);
    setBlocks(() => {
      const seed: Record<string, Block> = {};
      placed.forEach((p) => (seed[p.key] = { startMin: p.startMin, endMin: p.endMin }));
      return seed;
    });
    setManual((m) => ({ ...m, block: null }));
  }

  async function apply() {
    if (problems.length > 0) {
      setError("Fix the highlighted time conflicts before saving.");
      return;
    }
    if (total === 0) {
      setError("Add at least one task to your plan.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const rows: DayPlanAllocation[] = included.map((b) => {
        const i = b.item;
        return {
          key: i.key,
          title: i.title,
          hours: Math.round(((b.endMin - b.startMin) / 60) * 10) / 10,
          startTime: minToTime(b.startMin),
          endTime: minToTime(b.endMin),
          status: i.overdue
            ? "Overdue"
            : i.deadlineUnreachable
              ? "Deadline risk"
              : getDueStatus(i.deadline.toISOString()) === "Due Soon"
                ? "Due soon"
                : "In Progress",
          ticketId: i.ticketId ?? null,
          reason: `${i.remainingHours}h remaining · due ${formatDisplayDate(i.deadline)}`,
          confirm: null,
          worked: null,
        };
      });
      if (manual.block) {
        rows.push({
          key: "manual-1",
          title: manual.label.trim() || "Commitment",
          hours: manualHours,
          startTime: minToTime(manual.block.startMin),
          endTime: minToTime(manual.block.endMin),
          status: "Commitment",
          ticketId: null,
          reason: "Personal / admin time you set aside",
          confirm: null,
          worked: null,
        });
      }
      rows.sort((a, b) => timeToMin(a.startTime ?? "0:0") - timeToMin(b.startTime ?? "0:0"));
      await savePlan({
        employeeId: employee.id,
        date: dateKey,
        availableHours: available,
        allocations: rows,
        note: `${total}h planned across ${rows.length} block${rows.length === 1 ? "" : "s"}`,
        confirmedAt: null,
      });
      onClose();
    } catch (err) {
      console.error("Failed to save Plan My Day", err);
      setError(withErrorDetail("Couldn't save this plan", err));
    } finally {
      setBusy(false);
    }
  }

  const dayIsToday = day.getTime() === todayStart().getTime();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-8" onClick={onClose}>
      <div className="my-auto w-full max-w-xl rounded-xl border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Plan My Day</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              {dayIsToday ? "Today" : formatDisplayDate(day)} · {employee.workingSchedule || "07:00–16:00"}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 text-ink-muted hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex gap-1 rounded-lg border border-border-strong bg-surface p-1 text-xs font-medium">
          <button
            onClick={() => setTab("plan")}
            className={`flex-1 rounded-md px-3 py-1.5 ${tab === "plan" ? "bg-brand-800 text-white" : "text-ink-secondary hover:bg-brand-50"}`}
          >
            Plan the day
          </button>
          <button
            onClick={() => setTab("confirm")}
            disabled={!existing}
            className={`flex-1 rounded-md px-3 py-1.5 disabled:opacity-40 ${tab === "confirm" ? "bg-brand-800 text-white" : "text-ink-secondary hover:bg-brand-50"}`}
          >
            End of day{existing?.confirmedAt ? " ✓" : ""}
          </button>
        </div>

        {frame.onLeave ? (
          <p className="mt-4 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-3 text-sm text-[var(--status-warning)]">
            You&rsquo;re on leave this day — nothing to plan.
          </p>
        ) : !frame.isWorkingDay ? (
          <p className="mt-4 rounded-lg border border-border bg-brand-50/40 px-3 py-3 text-sm text-ink-muted">Not a working day.</p>
        ) : tab === "confirm" && existing ? (
          <EndOfDayConfirm
            plan={existing}
            getEntry={getEntry}
            onRecord={async (updated, ledger) => {
              setBusy(true);
              setError(null);
              try {
                for (const [key, worked] of ledger) {
                  const item = candByKey.get(key);
                  if (!item || worked <= 0) continue;
                  const cur = getEntry(key);
                  await setEffort(key, {
                    actualHours: Math.round(((cur.actualHours ?? 0) + worked) * 10) / 10,
                    remainingHours: Math.max(0, Math.round((item.remainingHours - worked) * 10) / 10),
                  });
                }
                await patchPlan(employee.id, existing.date, { allocations: updated, confirmedAt: formatDisplayDate(todayStart()) });
                onClose();
              } catch (err) {
                console.error("Failed to record worked hours", err);
                setError(withErrorDetail("Couldn't record your worked hours", err));
              } finally {
                setBusy(false);
              }
            }}
            busy={busy}
          />
        ) : (
          <>
            <div
              className={`mt-4 flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                remaining < 0 || problems.length > 0
                  ? "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]"
                  : "border-brand-100 bg-brand-50 text-brand-800"
              }`}
            >
              <span>
                {available}h available{frame.fixed.some((f) => f.kind === "event") ? " (around your calendar events)" : ""}
              </span>
              <span className="tabular font-semibold">
                {total}h planned{remaining >= 0 ? ` · ${remaining}h left` : ` · ${Math.abs(remaining)}h over`}
              </span>
            </div>

            {/* Fixed blocks the plan has to work around. */}
            {frame.fixed.length > 0 && (
              <ul className="mt-3 space-y-1">
                {frame.fixed.map((f, i) => (
                  <li
                    key={i}
                    className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                      f.kind === "lunch" ? "border-border-strong bg-brand-50/60 text-ink-secondary" : "border-purple-200 bg-purple-50 text-purple-900"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {f.title}
                    </span>
                    <span className="tabular font-medium">
                      {minToTime(f.startMin)}–{minToTime(f.endMin)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-secondary">Your tasks — pick times (30-min steps)</p>
              <button
                onClick={autoArrangeAll}
                className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:bg-brand-50"
              >
                <Wand2 className="h-3 w-3" />
                Auto-arrange
              </button>
            </div>

            <div className="mt-2 space-y-2">
              {candidates.length === 0 && <p className="text-sm text-ink-muted">No active tasks need time right now.</p>}
              {candidates.map((c) => {
                const b = blocks[c.key];
                const on = !!b;
                const prob = b ? blockProblem(c.key, b.startMin, b.endMin) : null;
                const due = getDueStatus(c.deadline.toISOString());
                return (
                  <div key={c.key} className={`rounded-lg border p-2.5 ${on ? (prob ? "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)]/40" : "border-brand-200 bg-brand-50/40") : "border-border"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex min-w-0 items-start gap-2">
                        <input type="checkbox" checked={on} onChange={() => toggleTask(c)} className="mt-0.5 accent-brand-700" />
                        <button
                          type="button"
                          onClick={c.ticketId && onOpenTicket ? () => { onClose(); onOpenTicket(c.ticketId!); } : undefined}
                          className={`min-w-0 text-left text-sm ${c.ticketId && onOpenTicket ? "hover:text-brand-700 hover:underline" : ""}`}
                        >
                          <span className="block truncate font-medium text-ink">{c.title}</span>
                          <span className="block text-[11px] text-ink-muted">
                            {c.remainingHours}h left · due {formatDisplayDate(c.deadline)}
                            {c.overdue ? " · overdue" : due === "Due Soon" ? " · due soon" : ""}
                            {c.isCoverage ? ` · covering ${c.coverageOwnerName ?? ""}` : ""}
                          </span>
                        </button>
                      </label>
                      {on && b && (
                        <div className="flex shrink-0 items-center gap-1 text-xs">
                          <TimeSelect value={b.startMin} marks={marks.filter((m) => m < frame.workEndMin)} onChange={(v) => setBlockTime(c.key, "start", v)} />
                          <span className="text-ink-muted">–</span>
                          <TimeSelect value={b.endMin} marks={marks.filter((m) => m > b.startMin)} onChange={(v) => setBlockTime(c.key, "end", v)} />
                          <span className="ml-1 tabular text-ink-muted">{Math.round(((b.endMin - b.startMin) / 60) * 10) / 10}h</span>
                        </div>
                      )}
                    </div>
                    {prob && <p className="mt-1 pl-6 text-[11px] font-medium text-[var(--status-warning)]">{prob}</p>}
                  </div>
                );
              })}

              {/* Manual commitment */}
              <div className={`rounded-lg border border-dashed p-2.5 ${manual.block ? "border-border-strong" : "border-border"}`}>
                <div className="flex items-start justify-between gap-3">
                  <label className="flex min-w-0 flex-1 items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!!manual.block}
                      onChange={() =>
                        setManual((m) => ({
                          ...m,
                          block: m.block ? null : findOpenSlot(frame, allBlocks.map((x) => ({ startMin: x.startMin, endMin: x.endMin })), 60) ?? { startMin: frame.workStartMin, endMin: frame.workStartMin + 60 },
                        }))
                      }
                      className="mt-0.5 accent-brand-700"
                    />
                    <input
                      value={manual.label}
                      onChange={(e) => setManual((m) => ({ ...m, label: e.target.value }))}
                      className="input min-w-0 flex-1 py-1 text-sm"
                      placeholder="Admin / calendar commitment"
                    />
                  </label>
                  {manual.block && (
                    <div className="flex shrink-0 items-center gap-1 text-xs">
                      <TimeSelect
                        value={manual.block.startMin}
                        marks={marks.filter((m) => m < frame.workEndMin)}
                        onChange={(v) => setManual((m) => (m.block ? { ...m, block: { startMin: v, endMin: Math.max(v + SLOT_MINUTES, m.block.endMin) } } : m))}
                      />
                      <span className="text-ink-muted">–</span>
                      <TimeSelect
                        value={manual.block.endMin}
                        marks={marks.filter((m) => manual.block && m > manual.block.startMin)}
                        onChange={(v) => setManual((m) => (m.block ? { ...m, block: { ...m.block, endMin: v } } : m))}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {problems.length > 0 && (
              <p className="mt-3 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-xs font-medium text-[var(--status-warning)]">
                {problems.length} time conflict{problems.length === 1 ? "" : "s"} to fix: {problems.map((p) => p.title).join(", ")}
              </p>
            )}

            {recs.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-secondary">Recommendations</p>
                {recs.map((r, i) => {
                  const S = REC_STYLE[r.tone];
                  return (
                    <p key={i} className={`flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${S.cls}`}>
                      <S.icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {r.text}
                    </p>
                  );
                })}
              </div>
            )}

            {error && <p className="mt-3 text-xs font-medium text-[var(--status-critical)]">{error}</p>}

            <p className="mt-3 text-[11px] text-ink-muted">
              This only arranges your own day. It doesn&rsquo;t change any task&rsquo;s priority, deadline, required skills or
              assignment.
            </p>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {existing && (
                <button
                  onClick={() =>
                    clearPlan(employee.id, dateKey)
                      .then(onClose)
                      .catch((err) => {
                        console.error("Failed to clear Plan My Day", err);
                        setError(withErrorDetail("Couldn't clear the saved plan", err));
                      })
                  }
                  className="rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-brand-50"
                >
                  Clear saved plan
                </button>
              )}
              <button onClick={onClose} className="rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-brand-50">
                Cancel
              </button>
              <button
                onClick={apply}
                disabled={busy || total === 0 || problems.length > 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {busy ? "Saving…" : existing ? "Update plan" : "Confirm plan"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function findOpenSlot(frame: DayFrame, taken: { startMin: number; endMin: number }[], minutes: number): Block | null {
  const need = Math.max(SLOT_MINUTES, Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES);
  for (const g of frame.free) {
    let cursor = g.startMin;
    while (cursor + SLOT_MINUTES <= g.endMin) {
      const end = Math.min(g.endMin, cursor + need);
      const clash = taken.some((t) => cursor < t.endMin && end > t.startMin);
      if (!clash && end - cursor >= SLOT_MINUTES) return { startMin: cursor, endMin: end };
      cursor += SLOT_MINUTES;
    }
  }
  return null;
}

function TimeSelect({ value, marks, onChange }: { value: number; marks: number[]; onChange: (v: number) => void }) {
  const options = marks.includes(value) ? marks : [value, ...marks].sort((a, b) => a - b);
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-border-strong bg-surface px-1 py-0.5 text-xs tabular"
    >
      {options.map((m) => (
        <option key={m} value={m}>
          {minToTime(m)}
        </option>
      ))}
    </select>
  );
}

// ------------------------------------------------------------------ End-of-day check

const CONFIRM_OPTIONS: { value: DayPlanConfirm; label: string }[] = [
  { value: "planned", label: "Worked as planned" },
  { value: "partial", label: "Partially worked" },
  { value: "skipped", label: "Did not work" },
];

function EndOfDayConfirm({
  plan,
  getEntry,
  onRecord,
  busy,
}: {
  plan: DayPlan;
  getEntry: (key: string) => { actualHours?: number | null };
  onRecord: (updated: DayPlanAllocation[], ledger: [string, number][]) => void;
  busy: boolean;
}) {
  const taskRows = plan.allocations.filter((a) => !a.key.startsWith("manual"));
  const done = !!plan.confirmedAt;

  const [state, setState] = useState<Record<string, { confirm: DayPlanConfirm; worked: number }>>(() => {
    const seed: Record<string, { confirm: DayPlanConfirm; worked: number }> = {};
    taskRows.forEach((a) => {
      seed[a.key] = {
        confirm: (a.confirm as DayPlanConfirm) ?? "planned",
        worked: a.worked ?? a.hours,
      };
    });
    return seed;
  });

  function build(): { updated: DayPlanAllocation[]; ledger: [string, number][] } {
    const ledger: [string, number][] = [];
    const updated = plan.allocations.map((a) => {
      if (a.key.startsWith("manual")) return a;
      const s = state[a.key];
      if (!s) return a;
      const worked = s.confirm === "planned" ? a.hours : s.confirm === "partial" ? snapHours(Math.max(0, Math.min(a.hours, s.worked))) : 0;
      // Every real task/ad-hoc block (not the manual admin row) contributes its
      // confirmed hours to that item's actual effort.
      if (worked > 0) ledger.push([a.key, worked]);
      return { ...a, confirm: s.confirm, worked };
    });
    return { updated, ledger };
  }

  const preview = build();
  const totalWorked = preview.ledger.reduce((s, [, w]) => s + w, 0);

  return (
    <div className="mt-4">
      <p className="text-xs text-ink-secondary">
        {done
          ? `You confirmed this day on ${plan.confirmedAt}. Worked hours were added to each task's actual effort.`
          : "Confirm what you actually worked. Only what you confirm is added to “Worked so far” — remaining effort updates to match."}
      </p>

      <ul className="mt-3 space-y-2">
        {taskRows.map((a) => {
          const s = state[a.key] ?? { confirm: "planned" as DayPlanConfirm, worked: a.hours };
          const loggedSoFar = a.key.startsWith("manual") ? null : getEntry(a.key).actualHours ?? 0;
          return (
            <li key={a.key} className="rounded-lg border border-border p-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{a.title}</span>
                  <span className="block text-[11px] text-ink-muted">
                    {a.startTime && a.endTime ? `${a.startTime}–${a.endTime} · ` : ""}
                    {a.hours}h planned
                    {loggedSoFar != null ? ` · ${loggedSoFar}h logged so far` : ""}
                  </span>
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {CONFIRM_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    disabled={done}
                    onClick={() => setState((prev) => ({ ...prev, [a.key]: { confirm: opt.value, worked: opt.value === "planned" ? a.hours : opt.value === "skipped" ? 0 : prev[a.key]?.worked ?? a.hours } }))}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium disabled:opacity-60 ${
                      s.confirm === opt.value ? "border-brand-700 bg-brand-800 text-white" : "border-border-strong bg-surface text-ink-secondary hover:bg-brand-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                {s.confirm === "partial" && (
                  <label className="ml-1 inline-flex items-center gap-1 text-[11px] text-ink-secondary">
                    Worked
                    <input
                      type="number"
                      min={0}
                      max={a.hours}
                      step={0.5}
                      disabled={done}
                      value={s.worked}
                      onChange={(e) => setState((prev) => ({ ...prev, [a.key]: { confirm: "partial", worked: Math.max(0, Math.min(a.hours, Number(e.target.value) || 0)) } }))}
                      className="w-16 rounded-md border border-border-strong bg-surface px-1.5 py-0.5 text-center text-xs tabular"
                    />
                    h
                  </label>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-center justify-between rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-800">
        <span>{done ? "Recorded" : "Will record"} to actual effort</span>
        <span className="tabular font-semibold">{Math.round(totalWorked * 10) / 10}h</span>
      </div>

      {!done && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => onRecord(preview.updated, preview.ledger)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {busy ? "Recording…" : "Record worked hours"}
          </button>
        </div>
      )}
    </div>
  );
}
