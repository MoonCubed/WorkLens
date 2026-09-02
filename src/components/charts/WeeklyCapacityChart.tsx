"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { OVERLOAD_THRESHOLD, RECOMMENDED_CAPACITY } from "@/data/config";
import { getCapacityStatus } from "@/lib/capacity";
import type { WeeklyCapacityPoint } from "@/lib/capacityEngine";

type Point = WeeklyCapacityPoint & { memberCount?: number };

/**
 * The supervisor's primary capacity view — planned capacity, week by week, rolled up
 * from the same evenly-distributed task schedule that drives every capacity number.
 * Weeks are Sunday-based and numbered 1–52; each is shown with its date range.
 */
export function WeeklyCapacityChart({ points }: { points: Point[] }) {
  const currentIdx = Math.max(0, points.findIndex((p) => p.isCurrent));
  const [selected, setSelected] = useState(currentIdx);
  const sel = points[selected];

  if (points.length === 0 || !sel) {
    return <p className="text-sm text-ink-muted py-4">No capacity data.</p>;
  }

  const status = getCapacityStatus(sel.utilization);

  return (
    <div>
      <div className="h-56 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--border-strong)" }}
              tick={{ fill: "var(--ink-muted)", fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--ink-muted)", fontSize: 12 }}
              width={40}
              domain={[0, 120]}
              ticks={[0, 40, 80, 120]}
              tickFormatter={(v: number) => `${v}%`}
            />
            <ReferenceLine y={RECOMMENDED_CAPACITY} stroke="var(--status-warning)" strokeDasharray="3 3" strokeOpacity={0.6} />
            <ReferenceLine y={OVERLOAD_THRESHOLD} stroke="var(--status-critical)" strokeDasharray="3 3" strokeOpacity={0.6} />
            <ReferenceLine x={sel.label} stroke="var(--brand-800)" strokeOpacity={0.5} />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                boxShadow: "0 4px 12px rgba(11,18,32,0.08)",
              }}
              labelStyle={{ color: "var(--ink-secondary)", fontWeight: 500, marginBottom: 2 }}
              labelFormatter={(label, payload) => {
                const p = payload?.[0]?.payload as Point | undefined;
                return p ? `Week ${p.weekNumber} · ${p.rangeLabel}` : String(label);
              }}
              formatter={(value, _name, entry) => {
                const p = entry?.payload as Point | undefined;
                return [`${value}%${p ? ` · ${p.scheduledHours}h planned / ${p.workingHours}h available` : ""}`, "Capacity"];
              }}
            />
            <Line
              type="monotone"
              dataKey="utilization"
              stroke="var(--series-1)"
              strokeWidth={2}
              dot={{ r: 3.5, fill: "var(--series-1)", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <LegendDash color="var(--status-warning)" label={`${RECOMMENDED_CAPACITY}% recommended capacity`} />
        <LegendDash color="var(--status-critical)" label={`${OVERLOAD_THRESHOLD}% overload threshold`} />
      </div>

      {/* Week navigation + detail for the selected week. */}
      <div className="mt-4 rounded-lg border border-border bg-brand-50/40 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setSelected((i) => Math.max(0, i - 1))}
            disabled={selected === 0}
            className="rounded-lg border border-border-strong bg-surface p-1.5 text-ink-secondary hover:bg-brand-50 disabled:opacity-40"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold text-ink">
              Week {sel.weekNumber} <span className="font-normal text-ink-muted">| {sel.rangeLabel}</span>
            </p>
            <p className="text-[11px] text-ink-muted">
              {sel.isCurrent ? "Current week" : "Planned"}
              {typeof sel.memberCount === "number" ? ` · ${sel.memberCount} team member${sel.memberCount === 1 ? "" : "s"}` : ""}
            </p>
          </div>
          <button
            onClick={() => setSelected((i) => Math.min(points.length - 1, i + 1))}
            disabled={selected === points.length - 1}
            className="rounded-lg border border-border-strong bg-surface p-1.5 text-ink-secondary hover:bg-brand-50 disabled:opacity-40"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Capacity" value={`${sel.utilization}%`} tone={status.text} />
          <Stat label="Planned work" value={`${sel.scheduledHours}h`} />
          <Stat label="Available" value={`${sel.availableHours}h`} />
          <Stat label="Tasks scheduled" value={String(sel.taskCount)} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular ${tone ?? "text-ink"}`}>{value}</p>
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
