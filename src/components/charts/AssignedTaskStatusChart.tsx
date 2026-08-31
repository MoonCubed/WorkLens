"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { TICKET_STATUS_OPTIONS, type TicketStatus } from "@/data/tickets";

const STATUS_COLORS: Record<TicketStatus, string> = {
  "In Progress": "var(--series-4)",
  "On Hold": "var(--ink-muted)",
  Completed: "var(--series-3)",
};

/** Pie chart of the assigned tickets grouped by status. Shows one slice per status
 * that actually has tickets, plus a legend with counts. */
export function AssignedTaskStatusChart({ tickets }: { tickets: { status: TicketStatus }[] }) {
  const counts = TICKET_STATUS_OPTIONS.map((status) => ({
    status,
    count: tickets.filter((t) => t.status === status).length,
    color: STATUS_COLORS[status],
  })).filter((d) => d.count > 0);

  const total = counts.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return <p className="text-sm text-ink-muted py-4">No assigned tasks yet.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={counts}
              dataKey="count"
              nameKey="status"
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={72}
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {counts.map((d) => (
                <Cell key={d.status} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                boxShadow: "0 4px 12px rgba(11,18,32,0.08)",
              }}
              labelStyle={{ color: "var(--ink-secondary)", fontWeight: 500, marginBottom: 2 }}
              formatter={(value, name) => {
                const count = Number(value) || 0;
                return [`${count} task${count === 1 ? "" : "s"} (${Math.round((count / total) * 100)}%)`, name];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-1">
        {counts.map((d) => (
          <div key={d.status} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-ink tabular">{d.count}</p>
              <p className="text-xs text-ink-muted">{d.status}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
