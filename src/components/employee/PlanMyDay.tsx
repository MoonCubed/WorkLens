"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Sparkles, X, Check, Info, AlertTriangle, Plus, Minus } from "lucide-react";
import type { Employee } from "@/data/types";
import { useTickets } from "@/store/tickets-store";
import { useWorkLog } from "@/store/work-log-store";
import { useCalendarEvents } from "@/store/calendar-events-store";
import { useDayPlans } from "@/store/day-plans-store";
import { buildDayPlan, buildPlanRecommendations, type PlanRecommendation } from "@/lib/planDay";
import { computeEmployeeSchedule, computeEmployeeCapacity, computeEmployeeWorkItems } from "@/lib/capacityEngine";
import { todayStart, isWorkingDay, addDays, formatDisplayDate, relativeDayLabel, getDueStatus } from "@/lib/date";

const REC_STYLE: Record<PlanRecommendation["tone"], { icon: typeof Info; cls: string }> = {
  info: { icon: Info, cls: "border-brand-100 bg-brand-50 text-brand-800" },
  warn: { icon: AlertTriangle, cls: "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]" },
  critical: { icon: AlertTriangle, cls: "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical)]" },
};

/**
 * "Plan My Day" — starts from a suggested allocation built from the shared schedule,
 * capacity, calendar events and priority ranking, then lets the employee choose which
 * tasks to work on and how many hours each. Shows the resulting day and live
 * recommendations before it's saved. Never touches supervisor-controlled task fields.
 */
export function PlanMyDay({ employee, onOpenTicket }: { employee: Employee; onOpenTicket?: (id: string) => void }) {
  const { getPlan } = useDayPlans();
  const [open, setOpen] = useState(false);

  const dateKey = useMemo(() => {
    let d = todayStart();
    while (!isWorkingDay(d)) d = addDays(d, 1);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`;
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
        {existing && <span className="ml-1 rounded-full bg-brand-100 px-1.5 text-[11px] font-semibold text-brand-700">saved</span>}
      </button>
      {open && <PlanMyDayModal employee={employee} onOpenTicket={onOpenTicket} onClose={() => setOpen(false)} />}
    </>
  );
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
  const { getEntry } = useWorkLog();
  const { events } = useCalendarEvents();
  const { getPlan, savePlan, clearPlan } = useDayPlans();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const day = useMemo(() => {
    let d = todayStart();
    while (!isWorkingDay(d)) d = addDays(d, 1);
    return d;
  }, []);

  const { schedule, capacity, suggestion, candidates, staleTitles } = useMemo(() => {
    const sch = computeEmployeeSchedule(employee, tickets, getEntry, events);
    const cap = computeEmployeeCapacity(employee, tickets, getEntry, events);
    const sug = buildDayPlan(employee, tickets, getEntry, events, day);
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
    return { schedule: sch, capacity: cap, suggestion: sug, candidates: cands, staleTitles: stale };
  }, [employee, tickets, getEntry, events, day]);

  const existing = getPlan(employee.id, suggestion.dateKey);

  const [hoursByKey, setHoursByKey] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    if (existing) existing.allocations.forEach((a) => !a.key.startsWith("manual") && (seed[a.key] = a.hours));
    else suggestion.rows.forEach((r) => !r.key.startsWith("manual") && (seed[r.key] = r.hours));
    return seed;
  });
  const [manualLabel, setManualLabel] = useState(
    () => existing?.allocations.find((a) => a.key.startsWith("manual"))?.title ?? "Admin / catch-up"
  );
  const [manualHours, setManualHours] = useState(
    () => existing?.allocations.find((a) => a.key.startsWith("manual"))?.hours ?? 0
  );

  const available = suggestion.availableHours;
  const taskTotal = Object.values(hoursByKey).reduce((s, h) => s + (h || 0), 0);
  const total = Math.round((taskTotal + manualHours) * 10) / 10;
  const remaining = Math.round((available - total) * 10) / 10;

  const recs = useMemo(
    () => buildPlanRecommendations(schedule, capacity, { selectedHoursByKey: hoursByKey, availableHours: available, manualHours, staleTitles }),
    [schedule, capacity, hoursByKey, available, manualHours, staleTitles]
  );

  function bump(key: string, delta: number, cap: number) {
    setHoursByKey((prev) => ({ ...prev, [key]: Math.min(cap, Math.max(0, Math.round(((prev[key] ?? 0) + delta) * 10) / 10)) }));
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const rows = candidates
        .filter((i) => (hoursByKey[i.key] ?? 0) > 0)
        .map((i) => ({
          key: i.key,
          title: i.title,
          hours: Math.round((hoursByKey[i.key] ?? 0) * 10) / 10,
          status: i.overdue
            ? "Overdue"
            : i.deadlineUnreachable
              ? "Deadline risk"
              : getDueStatus(i.deadline.toISOString()) === "Due Soon"
                ? "Due soon"
                : "In Progress",
          ticketId: i.ticketId ?? null,
          reason: `${i.remainingHours}h remaining · due ${formatDisplayDate(i.deadline)}`,
        }));
      if (manualHours > 0)
        rows.push({
          key: "manual-1",
          title: manualLabel.trim() || "Commitment",
          hours: Math.round(manualHours * 10) / 10,
          status: "Commitment",
          ticketId: null,
          reason: "Personal / admin time you set aside",
        });
      if (rows.length === 0) {
        setError("Add hours to at least one task before applying.");
        setBusy(false);
        return;
      }
      await savePlan({ employeeId: employee.id, date: suggestion.dateKey, availableHours: available, allocations: rows, note: suggestion.headline });
      onClose();
    } catch {
      setError("Couldn't save this plan — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const dayIsToday = day.getTime() === todayStart().getTime();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-8" onClick={onClose}>
      <div className="my-auto w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Plan My Day</h2>
            <p className="mt-0.5 text-xs text-ink-muted">{dayIsToday ? "Today" : formatDisplayDate(day)} · choose your tasks and hours</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-ink-muted hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
            remaining < 0 ? "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning)]" : "border-brand-100 bg-brand-50 text-brand-800"
          }`}
        >
          <span>{suggestion.onLeave ? "You're on leave this day." : `${available}h available${suggestion.eventHours > 0 ? ` (after ${suggestion.eventHours}h of calendar events)` : ""}`}</span>
          <span className="tabular font-semibold">
            {total}h planned{remaining >= 0 ? ` · ${remaining}h left` : ` · ${Math.abs(remaining)}h over`}
          </span>
        </div>

        {suggestion.calendarEvents.length > 0 && (
          <ul className="mt-3 space-y-1">
            {suggestion.calendarEvents.map((ev, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs text-purple-900">
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {ev.title}
                </span>
                <span className="tabular font-medium">
                  {ev.startTime}–{ev.endTime}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-2">
          {candidates.length === 0 && <p className="text-sm text-ink-muted">No active tasks need time right now.</p>}
          {candidates.map((i) => {
            const h = hoursByKey[i.key] ?? 0;
            const due = getDueStatus(i.deadline.toISOString());
            return (
              <div key={i.key} className={`rounded-lg border p-2.5 ${h > 0 ? "border-brand-200 bg-brand-50/40" : "border-border"}`}>
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={i.ticketId && onOpenTicket ? () => { onClose(); onOpenTicket(i.ticketId!); } : undefined}
                    className={`min-w-0 text-left text-sm ${i.ticketId && onOpenTicket ? "hover:text-brand-700 hover:underline" : ""}`}
                  >
                    <span className="block truncate font-medium text-ink">{i.title}</span>
                    <span className="block text-[11px] text-ink-muted">
                      {i.remainingHours}h left · due {formatDisplayDate(i.deadline)}
                      {i.overdue ? " · overdue" : due === "Due Soon" ? " · due soon" : ""}
                      {i.isCoverage ? ` · covering ${i.coverageOwnerName ?? ""}` : ""}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button onClick={() => bump(i.key, -0.5, i.remainingHours)} className="rounded border border-border-strong p-1 text-ink-secondary hover:bg-brand-50" aria-label="Less">
                      <Minus className="h-3 w-3" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={i.remainingHours}
                      step={0.5}
                      value={h || ""}
                      placeholder="0"
                      onChange={(e) => setHoursByKey((p) => ({ ...p, [i.key]: Math.max(0, Math.min(i.remainingHours, Number(e.target.value) || 0)) }))}
                      className="input w-14 py-1 text-center text-xs"
                    />
                    <span className="text-xs text-ink-muted">h</span>
                    <button onClick={() => bump(i.key, 0.5, i.remainingHours)} className="rounded border border-border-strong p-1 text-ink-secondary hover:bg-brand-50" aria-label="More">
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="rounded-lg border border-dashed border-border-strong p-2.5">
            <div className="flex items-center justify-between gap-3">
              <input value={manualLabel} onChange={(e) => setManualLabel(e.target.value)} className="input min-w-0 flex-1 py-1 text-sm" placeholder="Admin / calendar commitment" />
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => setManualHours((v) => Math.max(0, Math.round((v - 0.5) * 10) / 10))} className="rounded border border-border-strong p-1 text-ink-secondary hover:bg-brand-50" aria-label="Less">
                  <Minus className="h-3 w-3" />
                </button>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={manualHours || ""}
                  placeholder="0"
                  onChange={(e) => setManualHours(Math.max(0, Number(e.target.value) || 0))}
                  className="input w-14 py-1 text-center text-xs"
                />
                <span className="text-xs text-ink-muted">h</span>
                <button onClick={() => setManualHours((v) => Math.round((v + 0.5) * 10) / 10)} className="rounded border border-border-strong p-1 text-ink-secondary hover:bg-brand-50" aria-label="More">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </div>

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
              onClick={() => clearPlan(employee.id, suggestion.dateKey).then(onClose).catch(() => setError("Couldn't clear the saved plan."))}
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
            disabled={busy || total === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {busy ? "Saving…" : existing ? "Update plan" : "Apply plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
