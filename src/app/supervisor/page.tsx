"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Users, Gauge, CalendarClock, Ticket, AlertTriangle, ShieldAlert, ChevronRight, Ban, TrendingUp, X, CheckCircle2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { InfoTip } from "@/components/ui/InfoTip";
import { CapacityChart } from "@/components/charts/CapacityChart";
import { CapacityDistributionBar } from "@/components/charts/CapacityDistributionBar";
import { useTickets } from "@/store/tickets-store";
import { useSupervisorSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";
import { useWorkLog } from "@/store/work-log-store";
import { computeDashboardSummary, type AttentionTone, type DashboardSummary } from "@/lib/dashboardSummary";
import { todayLabel } from "@/lib/date";

const ATTENTION_STYLES: Record<AttentionTone, { icon: typeof AlertTriangle; text: string; bg: string; border: string; label: string }> = {
  critical: { icon: AlertTriangle, text: "text-[var(--status-critical)]", bg: "bg-[var(--status-critical-bg)]", border: "border-[var(--status-critical-border)]", label: "🔴" },
  serious: { icon: ShieldAlert, text: "text-[var(--status-serious)]", bg: "bg-[var(--status-serious-bg)]", border: "border-[var(--status-serious-border)]", label: "🟠" },
  warning: { icon: CalendarClock, text: "text-[var(--status-warning)]", bg: "bg-[var(--status-warning-bg)]", border: "border-[var(--status-warning-border)]", label: "🟡" },
  info: { icon: Ban, text: "text-brand-700", bg: "bg-brand-50", border: "border-brand-100", label: "🔵" },
  success: { icon: CheckCircle2, text: "text-[var(--status-good)]", bg: "bg-[var(--status-good-bg)]", border: "border-[var(--status-good-border)]", label: "✅" },
};

export default function SupervisorDashboardPage() {
  const { unit } = useSupervisorSession();
  const { tickets } = useTickets();
  const { employees } = useEmployees();
  const { getEntry } = useWorkLog();
  const [openKpi, setOpenKpi] = useState<KpiKey | null>(null);

  const summary = useMemo(() => computeDashboardSummary(unit, employees, tickets, getEntry), [unit, employees, tickets, getEntry]);

  const deliveryDistribution = [
    { key: "completed", label: "Completed", value: summary.workDelivery.completed, color: "var(--status-good)" },
    { key: "inProgress", label: "In Progress", value: summary.workDelivery.inProgress, color: "var(--brand-600)" },
    { key: "overdue", label: "Overdue", value: summary.workDelivery.overdue, color: "var(--status-critical)" },
    { key: "unassigned", label: "Unassigned", value: summary.workDelivery.unassigned, color: "var(--border-strong)" },
  ];

  return (
    <div className="max-w-7xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">{unit}</p>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Supervisor Dashboard</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Live view of your team&rsquo;s capacity, progress and delivery, as of {todayLabel()}. Click any metric for details.
        </p>
      </div>

      {/* KPI overview */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Team Members"
          value={String(summary.teamMembers)}
          icon={<Users className="h-4 w-4" />}
          info="teamMembers"
          onClick={() => setOpenKpi("teamMembers")}
        />
        <KpiCard
          label="Available Capacity"
          value={`${summary.totalAvailableHours}h`}
          hint={`${summary.availableCapacityPct}% of team capacity`}
          tone="good"
          icon={<Gauge className="h-4 w-4" />}
          info="availableCapacity"
          onClick={() => setOpenKpi("availableCapacity")}
        />
        <KpiCard
          label="On Leave"
          value={String(summary.onLeaveCount)}
          tone={summary.onLeaveCount > 0 ? "warning" : "neutral"}
          icon={<CalendarClock className="h-4 w-4" />}
          info="onLeave"
          onClick={() => setOpenKpi("onLeave")}
        />
        <KpiCard
          label="Open Tickets"
          value={String(summary.openTicketsCount)}
          icon={<Ticket className="h-4 w-4" />}
          info="openTickets"
          onClick={() => setOpenKpi("openTickets")}
        />
        <KpiCard
          label="Overdue Work"
          value={String(summary.overdueWorkCount)}
          tone={summary.overdueWorkCount > 0 ? "serious" : "neutral"}
          icon={<AlertTriangle className="h-4 w-4" />}
          info="overdueWork"
          onClick={() => setOpenKpi("overdueWork")}
        />
        <KpiCard
          label="At Risk"
          value={String(summary.atRiskCount)}
          tone={summary.atRiskCount > 0 ? "warning" : "neutral"}
          icon={<TrendingUp className="h-4 w-4" />}
          info="atRisk"
          onClick={() => setOpenKpi("atRisk")}
        />
      </div>

      {openKpi && <KpiDetailModal kpi={openKpi} summary={summary} onClose={() => setOpenKpi(null)} />}

      {/* Work Delivery */}
      <Card>
        <CardHeader title="Work Delivery" subtitle="Are we actually getting the work done?" />
        <CapacityDistributionBar data={deliveryDistribution} />
      </Card>

      {/* Capacity Outlook */}
      <Card>
        <CardHeader title="Capacity Outlook" subtitle="Team utilization by week or month — the current period is live, the rest is forecast." />
        <CapacityChart
          current={summary.teamUtilization}
          forecast={summary.forecast8Week.map((w) => w.utilization)}
          currentLabelText="This period, team average"
        />
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
          <LegendDash color="var(--status-warning)" label="80% recommended capacity threshold" />
          <LegendDash color="var(--status-critical)" label="95% overload threshold" />
        </div>
        <p className="mt-3 text-xs text-ink-muted border-t border-border pt-3">
          <span className="font-medium text-ink-secondary">Forecast</span> ≠ <span className="font-medium text-ink-secondary">What-If</span> —
          this is the expected future based on existing plans. To test a hypothetical change, use{" "}
          <Link href="/supervisor/what-if" className="text-brand-700 hover:underline">
            What-If
          </Link>
          .
        </p>
      </Card>

      {/* Team Capacity at a Glance */}
      <div>
        <div className="mb-3 flex items-center gap-1.5">
          <h2 className="text-sm font-semibold text-ink">Team Capacity at a Glance</h2>
          <InfoTip text="Utilization = active remaining work hours ÷ available working hours for the week × 100. Available capacity = available working hours − active remaining work hours. Approved leave reduces the available working hours; completed work and logged progress reduce active hours immediately." />
        </div>
        {summary.employeeCapacities.length === 0 ? (
          <Card className="flex items-center gap-3 text-sm text-ink-secondary">
            <Users className="h-4 w-4 text-ink-muted" />
            No employees are currently recorded under {unit}.
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.employeeCapacities.map((row) => (
              <Link
                key={row.employee.id}
                href={`/supervisor/people/${row.employee.id}`}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors hover:bg-brand-50/40 hover:border-brand-200"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-9 w-9 shrink-0 rounded-full bg-brand-800 text-white text-xs font-semibold flex items-center justify-center">
                      {row.employee.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </div>
                    <div className="min-w-0 leading-tight">
                      <p className="truncate text-sm font-medium text-ink">{row.employee.name}</p>
                      <p className="truncate text-xs text-ink-muted">{row.activeItems} active item{row.activeItems === 1 ? "" : "s"}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
                </div>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-ink-secondary">{row.capacity.utilization}% utilized</span>
                  <span className="tabular font-medium text-ink">{row.capacity.availableHours}h available</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-brand-50 overflow-hidden">
                  <div className={`h-full rounded-full ${row.status.dot}`} style={{ width: `${Math.min(100, row.capacity.utilization)}%` }} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${row.status.bg} ${row.status.border} ${row.status.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${row.status.dot}`} />
                    {row.status.label}
                  </span>
                  {row.onLeave && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--status-warning)]">
                      <CalendarClock className="h-3 w-3" />
                      {row.onLeave === "Now" ? "On Leave" : "Upcoming Leave"}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Attention Required */}
      {summary.attentionItems.length > 0 && (
        <Card>
          <CardHeader title="Attention Required" subtitle="The most important things that need a decision" />
          <ul className="space-y-2.5">
            {summary.attentionItems.map((item, i) => {
              const style = ATTENTION_STYLES[item.tone];
              return (
                <li key={i}>
                  <Link
                    href={item.href}
                    className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors hover:brightness-[0.98] ${style.bg} ${style.border}`}
                  >
                    <style.icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.text}`} strokeWidth={2} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>{item.label}</p>
                      <p className="text-sm text-ink mt-0.5">{item.message}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-ink-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {summary.teamMembers === 0 && (
        <Card className="flex items-center gap-3 text-sm text-ink-secondary">
          <Users className="h-4 w-4 text-ink-muted" />
          No employees are currently recorded under {unit} in the demo dataset.
        </Card>
      )}
    </div>
  );
}

function LegendDash({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-0.5 w-3.5 rounded-full" style={{ background: color, opacity: 0.7 }} />
      {label}
    </span>
  );
}

type KpiKey = "teamMembers" | "availableCapacity" | "onLeave" | "openTickets" | "overdueWork" | "atRisk";

interface KpiRow {
  key: string;
  href?: string;
  primary: string;
  secondary?: string;
  meta?: string;
}

/** Drill-down for a single KPI card — lists the individual people or work items the
 * headline number is counting, all as of today. */
function KpiDetailModal({ kpi, summary, onClose }: { kpi: KpiKey; summary: DashboardSummary; onClose: () => void }) {
  const itemHref = (i: { ticketId?: string; employeeId: string }) =>
    i.ticketId ? `/systems/tickets/${i.ticketId}` : `/supervisor/people/${i.employeeId}`;

  const views: Record<KpiKey, { title: string; subtitle: string; empty: string; rows: KpiRow[] }> = {
    teamMembers: {
      title: "Team Members",
      subtitle: `${summary.teamMembers} in your unit`,
      empty: "No employees are recorded under this unit.",
      rows: summary.employeeCapacities.map((r) => ({
        key: r.employee.id,
        href: `/supervisor/people/${r.employee.id}`,
        primary: r.employee.name,
        secondary: `${r.activeItems} active item${r.activeItems === 1 ? "" : "s"} · ${r.employee.workingSchedule}`,
        meta: `${r.capacity.utilization}% utilized`,
      })),
    },
    availableCapacity: {
      title: "Available Capacity",
      subtitle: `${summary.totalAvailableHours}h free across the team · ${summary.availableCapacityPct}% of ${summary.totalWeeklyHours}h`,
      empty: "No capacity data available.",
      rows: [...summary.employeeCapacities]
        .sort((a, b) => b.capacity.availableHours - a.capacity.availableHours)
        .map((r) => ({
          key: r.employee.id,
          href: `/supervisor/people/${r.employee.id}`,
          primary: r.employee.name,
          secondary: `${r.capacity.availableHours}h available of ${r.capacity.weeklyHours}h`,
          meta: `${r.capacity.utilization}% utilized`,
        })),
    },
    onLeave: {
      title: "On Leave Today",
      subtitle: `${summary.onLeaveCount} employee${summary.onLeaveCount === 1 ? "" : "s"} on approved leave on ${todayLabel()}`,
      empty: "Nobody on your team is on leave today.",
      rows: summary.onLeaveToday.map(({ employee, leave }) => ({
        key: employee.id,
        href: `/supervisor/people/${employee.id}`,
        primary: employee.name,
        secondary: leave.type,
        meta: `${leave.start} – ${leave.end}`,
      })),
    },
    openTickets: {
      title: "Open Tickets",
      subtitle: `${summary.openTicketsCount} ticket${summary.openTicketsCount === 1 ? "" : "s"} not yet resolved or closed`,
      empty: "No open tickets for this unit.",
      rows: summary.openTickets.map((t) => ({
        key: t.id,
        href: `/systems/tickets/${t.id}`,
        primary: t.title,
        secondary: `${t.id} · ${t.priority} priority`,
        meta: t.status,
      })),
    },
    overdueWork: {
      title: "Overdue Work",
      subtitle: `${summary.overdueWorkCount} active item${summary.overdueWorkCount === 1 ? "" : "s"} past their due date`,
      empty: "Nothing is overdue right now.",
      rows: summary.overdueItems.map((i) => ({
        key: i.key,
        href: itemHref(i),
        primary: i.title,
        secondary: i.employeeName,
        meta: i.dueDate ? `Due ${i.dueDate}` : undefined,
      })),
    },
    atRisk: {
      title: "Work At Risk",
      subtitle: `${summary.atRiskCount} item${summary.atRiskCount === 1 ? "" : "s"} likely to slip given today's workload`,
      empty: "No work is currently flagged at risk.",
      rows: summary.atRiskItems.map((i) => ({
        key: i.key,
        href: itemHref(i),
        primary: i.title,
        secondary: i.employeeName,
        meta: i.dueDate ? `Due ${i.dueDate}` : "No deadline",
      })),
    },
  };

  const view = views[kpi];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-8" onClick={onClose}>
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">{view.title}</h2>
            <p className="mt-0.5 text-xs text-ink-muted">{view.subtitle}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-ink-muted hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {view.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{view.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {view.rows.map((row) => {
              const body = (
                <div className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{row.primary}</p>
                    {row.secondary && <p className="truncate text-xs text-ink-muted mt-0.5">{row.secondary}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {row.meta && <span className="text-xs font-medium text-ink-secondary tabular">{row.meta}</span>}
                    {row.href && <ChevronRight className="h-4 w-4 text-ink-muted" />}
                  </div>
                </div>
              );
              return (
                <li key={row.key}>
                  {row.href ? (
                    <Link href={row.href} className="-mx-2 block rounded-lg px-2 transition-colors hover:bg-brand-50/40">
                      {body}
                    </Link>
                  ) : (
                    body
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
