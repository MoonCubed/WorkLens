"use client";

import { useMemo, useState } from "react";
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
import { todayStart } from "@/lib/date";

type Granularity = "weekly" | "monthly";

interface Period {
  key: string;
  label: string;
  utilization: number;
  isCurrent: boolean;
}

function startOfWeek(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() - c.getDay());
  return c;
}

/** Weekly periods: index 0 is the current week and its value is the live computed
 * utilization passed in; the rest come from the forward forecast. Each week carries
 * its own value — never the same number repeated. */
function weeklyPeriods(current: number, forecast: number[]): Period[] {
  const weekStart = startOfWeek(todayStart());
  return [current, ...forecast].map((utilization, i) => {
    const s = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i * 7);
    return {
      key: `w-${i}`,
      label: `${s.getDate()} ${s.toLocaleDateString("en-US", { month: "short" })}`,
      utilization: Math.round(utilization),
      isCurrent: i === 0,
    };
  });
}

/** Roll the weekly values up into calendar months — a month's value is the mean of
 * the weeks that start in it, so a monthly view is a genuine aggregate, not a copy
 * of the weekly series. */
function monthlyPeriods(current: number, forecast: number[]): Period[] {
  const weekStart = startOfWeek(todayStart());
  const today = todayStart();
  const thisMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
  const buckets = new Map<string, { sum: number; n: number; date: Date }>();
  [current, ...forecast].forEach((v, i) => {
    const s = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i * 7);
    const key = `${s.getFullYear()}-${s.getMonth()}`;
    const b = buckets.get(key) ?? { sum: 0, n: 0, date: new Date(s.getFullYear(), s.getMonth(), 1) };
    b.sum += v;
    b.n += 1;
    buckets.set(key, b);
  });
  return Array.from(buckets.entries()).map(([key, b]) => ({
    key: `m-${key}`,
    label: b.date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    utilization: Math.round(b.sum / b.n),
    isCurrent: key === thisMonthKey,
  }));
}

const TOOLTIP_STYLE = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 4px 12px rgba(11,18,32,0.08)",
} as const;

/** Capacity-over-time chart with Weekly / Monthly granularity and ← Previous /
 * This week / Next → navigation. The current period's percentage is the real,
 * live-computed capacity for that period; future periods come from the forecast.
 * Used on both the supervisor and employee views. */
export function CapacityChart({
  current,
  forecast,
  currentLabelText = "Current period",
}: {
  current: number;
  forecast: number[];
  currentLabelText?: string;
}) {
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const [offset, setOffset] = useState(0);

  const allPeriods = useMemo(
    () => (granularity === "weekly" ? weeklyPeriods(current, forecast) : monthlyPeriods(current, forecast)),
    [granularity, current, forecast]
  );

  const visibleCount = granularity === "weekly" ? Math.min(6, allPeriods.length) : Math.min(4, allPeriods.length);
  const maxOffset = Math.max(0, allPeriods.length - visibleCount);
  const clampedOffset = Math.min(Math.max(0, offset), maxOffset);
  const visible = allPeriods.slice(clampedOffset, clampedOffset + visibleCount);
  const currentPeriod = allPeriods.find((p) => p.isCurrent);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border-strong bg-surface p-1">
          {(["weekly", "monthly"] as const).map((g) => (
            <button
              key={g}
              onClick={() => {
                setGranularity(g);
                setOffset(0);
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                granularity === g ? "bg-brand-800 text-white" : "text-ink-secondary hover:bg-brand-50"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={clampedOffset === 0}
            className="rounded-lg border border-border-strong p-1.5 text-ink-secondary hover:bg-brand-50 disabled:opacity-40"
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOffset(0)}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-brand-50"
          >
            {granularity === "weekly" ? "This week" : "This month"}
          </button>
          <button
            onClick={() => setOffset((o) => Math.min(maxOffset, o + 1))}
            disabled={clampedOffset >= maxOffset}
            className="rounded-lg border border-border-strong p-1.5 text-ink-secondary hover:bg-brand-50 disabled:opacity-40"
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {currentPeriod && (
        <p className="mb-2 text-xs text-ink-muted">
          {currentLabelText}: <span className="font-semibold text-ink">{currentPeriod.utilization}%</span> utilized
        </p>
      )}

      <div className="h-64 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={visible} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
            <ReferenceLine y={80} stroke="var(--status-warning)" strokeDasharray="3 3" strokeOpacity={0.6} />
            <ReferenceLine y={95} stroke="var(--status-critical)" strokeDasharray="3 3" strokeOpacity={0.6} />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: "var(--ink-secondary)", fontWeight: 500, marginBottom: 2 }}
              formatter={(value) => [`${value}%`, "Utilization"]}
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
    </div>
  );
}
