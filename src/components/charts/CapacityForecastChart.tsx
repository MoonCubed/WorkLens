"use client";

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
import { OVERLOAD_THRESHOLD, RECOMMENDED_CAPACITY } from "@/data/config";

export function CapacityForecastChart({ data }: { data: { week: string; utilization: number }[] }) {
  return (
    <div className="h-64 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="week"
            tickLine={false}
            axisLine={{ stroke: "var(--border-strong)" }}
            tick={{ fill: "var(--ink-muted)", fontSize: 12 }}
            tickFormatter={(v: string) => v.replace("Week ", "W")}
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
  );
}
