"use client";

import { useMemo, useState } from "react";
import { Bell, Briefcase, CalendarClock, AlertTriangle, Gauge, X, ChevronRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge, PriorityBadge } from "@/components/ui/StatusBadge";
import { TaskDetailPanel } from "@/components/work/TaskDetailPanel";
import { DailyTasks } from "@/components/employee/DailyTasks";
import { getDueStatus, parseLooseDate } from "@/lib/date";
import {
  computeEmployeeWorkItems,
  computeEmployeeCapacity,
  type DisplayStatus,
  type EmployeeWorkItem,
  type EmployeeCapacity,
} from "@/lib/capacityEngine";
import { useEmployeeSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";
import { useTickets } from "@/store/tickets-store";
import { useWorkLog } from "@/store/work-log-store";
import { useTaskAdjustments } from "@/store/task-adjustments-store";

const STATUS_STYLES: Record<DisplayStatus | "Overdue", string> = {
  Completed: "bg-[var(--status-good-bg)] border-[var(--status-good-border)] text-[var(--status-good)]",
  "In Progress": "bg-brand-50 border-brand-100 text-brand-700",
  "On Hold": "bg-brand-50/60 border-border-strong text-ink-secondary",
  Overdue: "bg-[var(--status-critical-bg)] border-[var(--status-critical-border)] text-[var(--status-critical)]",
};

/** The active status to show for an employee's work item — In Progress / On Hold /
 * Overdue (a passed deadline on active work). Completed never reaches these lists. */
function activeStatusLabel(status: DisplayStatus, dueDate: string | null): DisplayStatus | "Overdue" {
  if (status === "In Progress" && dueDate && getDueStatus(dueDate) === "Overdue") return "Overdue";
  return status;
}

/** Ascending by due date (items without a parseable date sort last). */
function byDueDate(a: EmployeeWorkItem, b: EmployeeWorkItem): number {
  const da = a.dueDate ? parseLooseDate(a.dueDate)?.getTime() ?? Infinity : Infinity;
  const db = b.dueDate ? parseLooseDate(b.dueDate)?.getTime() ?? Infinity : Infinity;
  return da - db;
}

type KpiKey = "activeTasks" | "dueSoon" | "overdue" | "availableCapacity";

export default function EmployeeDashboardPage() {
  const { employeeId } = useEmployeeSession();
  const { employees } = useEmployees();
  const me = employees.find((e) => e.id === employeeId) ?? employees[0];
  const { tickets, updateTicketStatus, updateTicketPriority, updateTicketSkills, setTicketAssignees, setTicketEffortSplit } = useTickets();
  const { getEntry } = useWorkLog();
  const { submit: submitAdjustment } = useTaskAdjustments();
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [openKpi, setOpenKpi] = useState<KpiKey | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const firstName = me.name.split(" ")[0];
  // One capacity calculation, shared by every number on this page.
  const capacity = useMemo(() => computeEmployeeCapacity(me, tickets, getEntry), [me, tickets, getEntry]);
  const availPct = capacity.availablePercent;

  const workItems = useMemo(() => computeEmployeeWorkItems(me, tickets, getEntry), [me, tickets, getEntry]);
  const activeWorkItems = useMemo(() => workItems.filter((i) => i.status !== "Completed"), [workItems]);
  const overdueItems = useMemo(
    () => activeWorkItems.filter((i) => i.dueDate && getDueStatus(i.dueDate) === "Overdue").sort(byDueDate),
    [activeWorkItems]
  );
  const dueSoonItems = useMemo(
    () => activeWorkItems.filter((i) => i.dueDate && getDueStatus(i.dueDate) === "Due Soon").sort(byDueDate),
    [activeWorkItems]
  );
  const detailTicket = openTicketId ? tickets.find((t) => t.id === openTicketId) ?? null : null;

  // Deadline-driven weekly load per bucket, so the rows add up to the week's working hours.
  const operationalHours = Math.round(activeWorkItems.filter((i) => i.type === "Ticket").reduce((s, i) => s + i.weeklyRequiredHours, 0) * 10) / 10;
  const adhocHours = Math.round(activeWorkItems.filter((i) => i.type === "Ad-hoc").reduce((s, i) => s + i.weeklyRequiredHours, 0) * 10) / 10;
  const workloadRows = [
    { label: "Assigned tickets", hours: operationalHours },
    { label: "Ad-hoc work", hours: adhocHours },
    { label: "Available", hours: capacity.availableHours },
  ];

  function openTicketFromKpi(ticketId: string) {
    setOpenKpi(null);
    setOpenTicketId(ticketId);
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Good morning, {firstName}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          What needs your attention, and what&rsquo;s scheduled day by day this week. Click a metric for details.
        </p>
      </div>

      {detailError && (
        <p className="rounded-lg border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3 text-sm text-[var(--status-critical)]">
          {detailError}
        </p>
      )}

      {/* KPIs — the first thing the employee sees. Each opens a focused drill-down. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Active Tasks"
          value={String(activeWorkItems.length)}
          icon={<Briefcase className="h-4 w-4" />}
          onClick={() => setOpenKpi("activeTasks")}
        />
        <KpiCard
          label="Due Soon"
          value={String(dueSoonItems.length)}
          tone={dueSoonItems.length > 0 ? "warning" : "neutral"}
          icon={<CalendarClock className="h-4 w-4" />}
          onClick={() => setOpenKpi("dueSoon")}
        />
        <KpiCard
          label="Overdue"
          value={String(overdueItems.length)}
          tone={overdueItems.length > 0 ? "serious" : "neutral"}
          icon={<AlertTriangle className="h-4 w-4" />}
          onClick={() => setOpenKpi("overdue")}
        />
        <KpiCard
          label="Available Capacity"
          value={`${availPct}%`}
          hint={`${capacity.availableHours}h free · ${capacity.utilization}% utilized`}
          tone="good"
          icon={<Gauge className="h-4 w-4" />}
          onClick={() => setOpenKpi("availableCapacity")}
        />
      </div>

      {openKpi && (
        <EmployeeKpiModal
          kpi={openKpi}
          onClose={() => setOpenKpi(null)}
          activeItems={activeWorkItems}
          dueSoonItems={dueSoonItems}
          overdueItems={overdueItems}
          capacity={capacity}
          availPct={availPct}
          workloadRows={workloadRows}
          onOpenTicket={openTicketFromKpi}
        />
      )}

      <Card>
        <CardHeader title="Active Tasks" subtitle="In Progress, On Hold and Overdue work assigned to you" />
        {activeWorkItems.length === 0 ? (
          <p className="text-sm text-ink-muted py-4">No active work assigned right now.</p>
        ) : (
          <ul className="divide-y divide-border">
            {activeWorkItems.map((item) => (
              <li
                key={item.key}
                onClick={item.ticketId ? () => setOpenTicketId(item.ticketId!) : undefined}
                onKeyDown={(e) => item.ticketId && e.key === "Enter" && setOpenTicketId(item.ticketId!)}
                role={item.ticketId ? "button" : undefined}
                tabIndex={item.ticketId ? 0 : undefined}
                className={`flex flex-wrap items-center justify-between gap-3 py-3 ${
                  item.ticketId ? "cursor-pointer rounded-lg px-2 -mx-2 outline-none hover:bg-brand-50/40 focus:bg-brand-50/40 transition-colors" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{item.title}</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {item.type} · Due {item.dueDate ?? "No deadline"}
                    {item.resumedFromHold && <span className="text-brand-700"> · resumed after hold</span>}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="tabular text-xs text-ink-secondary">{item.progress}%</span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[activeStatusLabel(item.status, item.dueDate)]}`}>
                    {activeStatusLabel(item.status, item.dueDate)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Daily Tasks" subtitle="Your scheduled work for this week — each task's effort spread evenly across the working days until its deadline" />
        <DailyTasks employee={me} onOpenTicket={(id) => setOpenTicketId(id)} />
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3.5">
        <Bell className="h-4 w-4 mt-0.5 shrink-0 text-brand-700" />
        <p className="text-sm text-brand-800">
          You currently have <span className="font-semibold">{capacity.availableHours} hours</span> of available capacity
          this week.
        </p>
      </div>

      {capacity.utilization > 100 && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-4 py-3.5">
          <Bell className="h-4 w-4 mt-0.5 shrink-0 text-[var(--status-critical)]" />
          <div className="text-sm text-ink">
            <p>
              Your planned work this week (<span className="font-semibold">{capacity.activeHours}h</span>) is more than your
              available hours (<span className="font-semibold">{capacity.workingHours}h</span>).
            </p>
            <p className="mt-1 text-ink-secondary">
              A deadline may be at risk — consider requesting an adjustment or a handover.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader
          title="Workload Breakdown"
          subtitle={`This week · ${capacity.workingHours}h available${
            capacity.workingHours !== capacity.weeklyHours ? ` (of ${capacity.weeklyHours}h, reduced for leave)` : ""
          }`}
        />
        <div className="space-y-4">
          {workloadRows.map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-ink-secondary">{row.label}</span>
                <span className="tabular font-medium text-ink">{row.hours}h</span>
              </div>
              <div className="h-1.5 rounded-full bg-brand-50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${Math.min(100, capacity.workingHours ? (row.hours / capacity.workingHours) * 100 : 0)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {detailTicket && (
        <TaskDetailPanel
          key={detailTicket.id}
          ticket={detailTicket}
          employees={employees.filter((e) => e.department === me.department && e.level !== "Supervisor")}
          currentUserName={me.name}
          currentEmployeeId={me.id}
          onClose={() => setOpenTicketId(null)}
          onUpdateStatus={(status, hold) => updateTicketStatus(detailTicket.id, status, hold).catch(() => setDetailError("Couldn't update status — check your connection and try again."))}
          onUpdatePriority={(priority) => updateTicketPriority(detailTicket.id, priority).catch(() => setDetailError("Couldn't update priority — check your connection and try again."))}
          onUpdateSkills={(skills) => updateTicketSkills(detailTicket.id, skills).catch(() => setDetailError("Couldn't update skills — check your connection and try again."))}
          onUpdateAssignees={(ids, split) => setTicketAssignees(detailTicket.id, ids, split).catch(() => setDetailError("Couldn't update assignees — check your connection and try again."))}
          onUpdateEffortSplit={(split) => setTicketEffortSplit(detailTicket.id, split).catch(() => setDetailError("Couldn't update the effort split — check your connection and try again."))}
          onRequestAdjustment={(draft) =>
            submitAdjustment({
              ticketId: detailTicket.id,
              employeeId: me.id,
              kind: draft.kind,
              requestedDeadline: draft.requestedDeadline,
              requestedHours: draft.requestedHours,
              justification: draft.justification,
            })
          }
        />
      )}
    </div>
  );
}

const KPI_META: Record<KpiKey, { title: string; subtitle: (n: number) => string; empty: string }> = {
  activeTasks: {
    title: "Active Tasks",
    subtitle: (n) => `${n} task${n === 1 ? "" : "s"} in progress, on hold or overdue`,
    empty: "No active work assigned right now.",
  },
  dueSoon: {
    title: "Due Soon",
    subtitle: (n) => `${n} task${n === 1 ? "" : "s"} approaching their deadline — closest first`,
    empty: "Nothing is due soon.",
  },
  overdue: {
    title: "Overdue",
    subtitle: (n) => `${n} task${n === 1 ? "" : "s"} past their deadline — needs immediate attention`,
    empty: "Nothing is overdue right now.",
  },
  availableCapacity: {
    title: "Available Capacity",
    subtitle: () => "Your current workload and capacity for this week",
    empty: "",
  },
};

function EmployeeKpiModal({
  kpi,
  onClose,
  activeItems,
  dueSoonItems,
  overdueItems,
  capacity,
  availPct,
  workloadRows,
  onOpenTicket,
}: {
  kpi: KpiKey;
  onClose: () => void;
  activeItems: EmployeeWorkItem[];
  dueSoonItems: EmployeeWorkItem[];
  overdueItems: EmployeeWorkItem[];
  capacity: EmployeeCapacity;
  availPct: number;
  workloadRows: { label: string; hours: number }[];
  onOpenTicket: (ticketId: string) => void;
}) {
  const meta = KPI_META[kpi];
  const list = kpi === "activeTasks" ? activeItems : kpi === "dueSoon" ? dueSoonItems : kpi === "overdue" ? overdueItems : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-8" onClick={onClose}>
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">{meta.title}</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              {kpi === "availableCapacity" ? meta.subtitle(0) : meta.subtitle(list.length)}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 text-ink-muted hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {kpi === "availableCapacity" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <MiniStat label="Utilized" value={`${capacity.utilization}%`} />
              <MiniStat label="Available" value={`${availPct}%`} />
              <MiniStat label="Free hours" value={`${capacity.availableHours}h`} />
            </div>
            <div className="flex justify-center">
              <StatusBadge utilization={capacity.utilization} />
            </div>
            <div className="space-y-3 border-t border-border pt-4">
              {workloadRows.map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-ink-secondary">{row.label}</span>
                    <span className="tabular font-medium text-ink">{row.hours}h</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-brand-50">
                    <div
                      className="h-full rounded-full bg-brand-600"
                      style={{ width: `${Math.min(100, capacity.workingHours ? (row.hours / capacity.workingHours) * 100 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-ink-muted">
                {capacity.workingHours}h available this week
                {capacity.workingHours !== capacity.weeklyHours ? ` (of ${capacity.weeklyHours}h, reduced for leave)` : ""}. Each
                task&rsquo;s effort is spread evenly across the working days until its deadline.
              </p>
            </div>
          </div>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{meta.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((item) => {
              const label = activeStatusLabel(item.status, item.dueDate);
              const row = (
                <div className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                      <PriorityBadge priority={item.priority} />
                      <span>Due {item.dueDate ?? "No deadline"}</span>
                      {item.remainingHours > 0 && <span>· {item.remainingHours}h left</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[label]}`}>
                      {label}
                    </span>
                    {item.ticketId && <ChevronRight className="h-4 w-4 text-ink-muted" />}
                  </div>
                </div>
              );
              return (
                <li key={item.key}>
                  {item.ticketId ? (
                    <button
                      onClick={() => onOpenTicket(item.ticketId!)}
                      className="-mx-2 block w-full rounded-lg px-2 text-left transition-colors hover:bg-brand-50/40"
                    >
                      {row}
                    </button>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-brand-50/40 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular text-ink">{value}</p>
    </div>
  );
}
