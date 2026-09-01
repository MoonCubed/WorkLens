"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ChevronRight, LayoutList, LayoutGrid, CalendarClock } from "lucide-react";
import type { Employee } from "@/data/types";
import type { AssignedTicket } from "@/store/tickets-store";
import { getCapacityStatus } from "@/lib/capacity";
import { employeeAvailablePercent, isCurrentlyOnLeave } from "@/lib/capacityEngine";
import { getEmployeeWorkCounts, getEmployeeTasks } from "@/lib/unit-summary";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CapacityBar } from "@/components/ui/ProgressBar";
import { useSkills } from "@/store/skills-store";

const STATUS_OPTIONS = ["Healthy", "At Risk", "Overloaded", "Critical", "On Leave"];

/** An "On Leave" pill for employees currently on approved leave — shown instead of a
 * capacity status, since they have 0h / 0% available and aren't assignable. */
function OnLeaveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2.5 py-1 text-xs font-medium text-[var(--status-warning)]">
      <CalendarClock className="h-3 w-3" />
      On Leave
    </span>
  );
}

export function TeamCapacityView({
  employees,
  tickets,
  detailBasePath,
}: {
  employees: Employee[];
  tickets: AssignedTicket[];
  detailBasePath: string;
}) {
  const [query, setQuery] = useState("");
  const [skill, setSkill] = useState("all");
  const [status, setStatus] = useState("all");
  const [view, setView] = useState<"table" | "card">("card");
  const { skillNames } = useSkills();

  // Filter options come from the central catalogue, plus any skill actually held by
  // someone in this unit that isn't in the catalogue yet.
  const allSkills = useMemo(() => {
    const set = new Set<string>(skillNames);
    employees.forEach((e) => e.skills.forEach((s) => set.add(s.name)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [employees, skillNames]);

  const filtered = useMemo(() => {
    const matched = employees.filter((e) => {
      const onLeave = isCurrentlyOnLeave(e);
      const statusLabel = onLeave ? "On Leave" : getCapacityStatus(e.currentUtilization).label;
      if (query && !e.name.toLowerCase().includes(query.toLowerCase())) return false;
      if (skill !== "all" && !e.skills.some((s) => s.name === skill)) return false;
      if (status !== "all" && statusLabel !== status) return false;
      return true;
    });
    // Employees currently on leave sort to the bottom — they're unavailable for
    // assignment, so a supervisor scanning for capacity sees available people first.
    return [...matched].sort((a, b) => Number(isCurrentlyOnLeave(a)) - Number(isCurrentlyOnLeave(b)));
  }, [employees, query, skill, status]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-lg border border-border-strong bg-surface py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          />
        </div>

        <Select value={skill} onChange={setSkill} label="Skill">
          <option value="all">All skills</option>
          {allSkills.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        <Select value={status} onChange={setStatus} label="Status">
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border-strong bg-surface p-1">
          <button
            onClick={() => setView("table")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "table" ? "bg-brand-800 text-white" : "text-ink-secondary hover:bg-brand-50"
            }`}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Table View
          </button>
          <button
            onClick={() => setView("card")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "card" ? "bg-brand-800 text-white" : "text-ink-secondary hover:bg-brand-50"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Card View
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-ink-muted">
        Showing {filtered.length} of {employees.length} employees
      </p>

      {view === "table" ? (
        <TableView employees={filtered} detailBasePath={detailBasePath} />
      ) : (
        <CardGridView employees={filtered} tickets={tickets} detailBasePath={detailBasePath} />
      )}
    </div>
  );
}

function TableView({
  employees,
  detailBasePath,
}: {
  employees: Employee[];
  detailBasePath: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-brand-50/60 text-left text-xs font-medium uppercase tracking-wide text-ink-secondary">
            <th className="px-4 py-3">Employee</th>
            <th className="px-4 py-3">Skills</th>
            <th className="px-4 py-3">Active Tasks</th>
            <th className="px-4 py-3">Tickets</th>
            <th className="px-4 py-3 w-36">Current Utilization</th>
            <th className="px-4 py-3">Available Capacity</th>
            <th className="px-4 py-3">Future Capacity</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-2 py-3" />
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => {
            const onLeave = isCurrentlyOnLeave(e);
            const avail = employeeAvailablePercent(e);
            const counts = getEmployeeWorkCounts(e);
            return (
              <tr key={e.id} className="border-b border-border last:border-0 hover:bg-brand-50/40 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`${detailBasePath}/${e.id}`} className="flex items-center gap-3 group">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-brand-800 text-white text-xs font-semibold flex items-center justify-center">
                      {e.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </div>
                    <div className="leading-tight">
                      <p className="font-medium text-ink group-hover:text-brand-700 group-hover:underline underline-offset-2">
                        {e.name}
                      </p>
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 max-w-[220px]">
                    {e.skills.slice(0, 3).map((s) => (
                      <span key={s.name} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-800 whitespace-nowrap">
                        {s.name}
                      </span>
                    ))}
                    {e.skills.length > 3 && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-ink-muted">+{e.skills.length - 3}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 tabular text-ink-secondary">{counts.activeTasks}</td>
                <td className="px-4 py-3 tabular text-ink-secondary">{counts.tickets}</td>
                <td className="px-4 py-3 w-36">
                  {onLeave ? <span className="text-xs text-ink-muted">On leave</span> : <CapacityBar value={e.currentUtilization} />}
                </td>
                <td className="px-4 py-3 tabular text-ink-secondary">{onLeave ? "0h / 0%" : `${avail}%`}</td>
                <td className="px-4 py-3 tabular text-ink-secondary">{e.futureCapacity}%</td>
                <td className="px-4 py-3">
                  {onLeave ? <OnLeaveBadge /> : <StatusBadge utilization={e.currentUtilization} />}
                </td>
                <td className="px-2 py-3">
                  <Link href={`${detailBasePath}/${e.id}`}>
                    <ChevronRight className="h-4 w-4 text-ink-muted" />
                  </Link>
                </td>
              </tr>
            );
          })}
          {employees.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-muted">
                No employees match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const TASK_TYPE_STYLES: Record<"Ticket" | "Ad-hoc", string> = {
  Ticket: "bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning)]",
  "Ad-hoc": "bg-brand-50/60 border-border-strong text-ink-secondary",
};

function CardGridView({
  employees,
  tickets,
  detailBasePath,
}: {
  employees: Employee[];
  tickets: AssignedTicket[];
  detailBasePath: string;
}) {
  if (employees.length === 0) {
    return <p className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-ink-muted">No employees match the current filters.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {employees.map((e) => {
        const onLeave = isCurrentlyOnLeave(e);
        const avail = employeeAvailablePercent(e);
        const tasks = getEmployeeTasks(e, tickets);
        const visibleTasks = tasks.slice(0, 4);
        return (
          <div key={e.id} className="flex flex-col rounded-xl border border-border bg-surface p-4 shadow-sm">
            <Link href={`${detailBasePath}/${e.id}`} className="flex items-center gap-3 group">
              <div className="h-10 w-10 shrink-0 rounded-full bg-brand-800 text-white text-sm font-semibold flex items-center justify-center">
                {e.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate font-medium text-ink group-hover:text-brand-700 group-hover:underline underline-offset-2">
                  {e.name}
                </p>
                <p className="truncate text-xs text-ink-muted">{e.department}</p>
              </div>
            </Link>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-ink-secondary">Current Capacity</span>
                  <span className="tabular font-medium text-ink">{onLeave ? "—" : `${e.currentUtilization}%`}</span>
                </div>
                <CapacityBar value={onLeave ? 0 : e.currentUtilization} showLabel={false} />
              </div>
              {onLeave ? <OnLeaveBadge /> : <StatusBadge utilization={e.currentUtilization} />}
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">
              {onLeave ? "0h / 0% available — on leave" : `${avail}% available capacity`}
            </p>

            <div className="mt-4 pt-3 border-t border-border">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-secondary">
                Tasks ({tasks.length})
              </p>
              {tasks.length === 0 ? (
                <p className="text-xs text-ink-muted">No active tasks.</p>
              ) : (
                <ul className="space-y-1.5">
                  {visibleTasks.map((t) => (
                    <li key={t.key} className="flex items-center gap-2 text-xs">
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 font-medium ${TASK_TYPE_STYLES[t.type]}`}>
                        {t.type}
                      </span>
                      <span className="truncate text-ink-secondary">{t.name}</span>
                    </li>
                  ))}
                  {tasks.length > visibleTasks.length && (
                    <li className="text-xs text-ink-muted">+{tasks.length - visibleTasks.length} more</li>
                  )}
                </ul>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {e.skills.slice(0, 3).map((s) => (
                <span key={s.name} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-800">
                  {s.name}
                </span>
              ))}
            </div>

            <Link
              href={`${detailBasePath}/${e.id}`}
              className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-brand-50"
            >
              View Details
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        );
      })}
    </div>
  );
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="sr-only-label">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border-strong bg-surface py-2.5 px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
      >
        {children}
      </select>
    </label>
  );
}
