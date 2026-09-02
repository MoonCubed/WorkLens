"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { AssignedTicket } from "@/store/tickets-store";
import { ticketDueLabel } from "@/lib/due";
import { getDueStatus } from "@/lib/date";
import { unifiedItemStatus } from "@/lib/capacityEngine";

/** The active task-status buckets an employee's work falls into. Completed work is
 * deliberately excluded — once a task is done it's no longer active employee work and
 * drops off this view (it still lives in the completed/historical task lists). Overdue
 * takes priority over In Progress / On Hold, matching `deliveryBucket`. */
type ActiveBucket = "In Progress" | "On Hold" | "Overdue";

const BUCKET_ORDER: ActiveBucket[] = ["In Progress", "On Hold", "Overdue"];

const BUCKET_COLORS: Record<ActiveBucket, string> = {
  "In Progress": "var(--series-4)",
  "On Hold": "var(--ink-muted)",
  Overdue: "var(--status-critical)",
};

function bucketFor(ticket: AssignedTicket): ActiveBucket | null {
  // Same status resolution as the dashboard / calendar / capacity — an On Hold ticket
  // whose hold window has passed auto-resumes and reads as In Progress / Overdue here too.
  const status = unifiedItemStatus(undefined, ticket.status, ticket.holdEndDate ?? null);
  if (status === "Completed") return null;
  if (getDueStatus(ticketDueLabel(ticket)) === "Overdue") return "Overdue";
  if (status === "On Hold") return "On Hold";
  return "In Progress";
}

/** Pie chart of an employee's active assigned tasks grouped by status — In Progress,
 * On Hold, Overdue. Completed tasks are excluded. */
export function AssignedTaskStatusChart({ tickets }: { tickets: AssignedTicket[] }) {
  const counts = BUCKET_ORDER.map((bucket) => ({
    status: bucket,
    count: tickets.filter((t) => bucketFor(t) === bucket).length,
    color: BUCKET_COLORS[bucket],
  })).filter((d) => d.count > 0);

  const total = counts.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return <p className="text-sm text-ink-muted py-4">No active tasks.</p>;
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
