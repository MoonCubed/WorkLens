"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { PriorityBadge } from "@/components/ui/StatusBadge";
import { SourceSystemNotice } from "@/components/systems/SourceSystemHeader";
import { SystemPageShell } from "@/components/systems/SystemPageShell";
import { InfoTip } from "@/components/ui/InfoTip";
import { TICKET_STATUS_OPTIONS, type TicketStatus } from "@/data/tickets";
import { useTickets } from "@/store/tickets-store";
import { useEmployees } from "@/store/employees-store";
import { slaWindowLabel, isSlaDerived } from "@/lib/date";
import { ticketDueLabel } from "@/lib/due";
import { ticketEffortForEmployee } from "@/lib/capacityEngine";

const STATUS_OPTIONS: TicketStatus[] = TICKET_STATUS_OPTIONS;

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const { tickets, updateTicketStatus } = useTickets();
  const { employees } = useEmployees();
  const ticket = tickets.find((t) => t.id === params.id);
  const [status, setStatus] = useState<TicketStatus | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!ticket) {
    return (
      <SystemPageShell>
        <Link href="/systems/tickets" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
          <ArrowLeft className="h-4 w-4" />
          Back to IT Ticket System
        </Link>
        <p className="text-sm text-ink-muted">Incident not found.</p>
      </SystemPageShell>
    );
  }

  const currentStatus = status ?? ticket.status;
  const dueLabel = ticketDueLabel(ticket);
  const slaDerived = isSlaDerived(ticket.expectedResolutionDate);
  const assigneeIds = ticket.assignedEmployeeIds ?? [];
  const assignees = assigneeIds
    .map((id) => employees.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => !!e);
  const assignedToValue =
    assignees.length === 0
      ? "Unassigned"
      : assignees
          .map((e) => (assignees.length > 1 ? `${e.name} (${ticketEffortForEmployee(ticket!, e.id)}h)` : e.name))
          .join(", ");

  async function handleSave() {
    if (currentStatus === ticket!.status) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateTicketStatus(ticket!.id, currentStatus);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError("Couldn't save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SystemPageShell>
      <Link href="/systems/tickets" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to IT Ticket System
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">{ticket.id}</p>
          <h1 className="mt-0.5 text-2xl font-semibold text-ink tracking-tight">{ticket.title}</h1>
          <p className="mt-1 text-sm text-ink-secondary">Raised {ticket.raisedDate}</p>
        </div>
        <PriorityBadge priority={ticket.priority} />
      </div>

      <Card>
        <p className="text-sm leading-relaxed text-ink-secondary">{ticket.description}</p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Assigned Unit" value={ticket.assignedUnit} />
        <Detail
          label="Estimated Effort"
          value={`${ticket.estimatedHours} hour${ticket.estimatedHours === 1 ? "" : "s"}`}
          info="Expected amount of work required to complete this incident."
        />
        <Detail
          label="SLA"
          value={`${slaWindowLabel(ticket.priority)} to resolve`}
          info="Target resolution time, set by priority: High 24 hours, Medium 1 week, Low 1 month. Not manually editable."
        />
        <Detail
          label="Due"
          value={slaDerived ? `${dueLabel} (SLA)` : dueLabel}
          info={
            slaDerived
              ? "No explicit deadline was set, so this falls back to the priority's SLA window from the raised date."
              : "The explicit resolution date set on this incident."
          }
        />
        <Detail label="Resolved Date" value={ticket.resolvedDate ?? "—"} />
        <Detail label="Created By" value={ticket.createdBy} />
        <Detail label="Assigned By" value={ticket.assignedBy} />
        <Detail
          label="Assigned To"
          value={assignedToValue}
          info="Set inside WorkLens by the unit supervisor. Reflected everywhere the assignee's workload appears."
        />
      </div>

      <p className="text-xs text-ink-muted -mt-2">
        Estimated Effort and SLA measure different things: effort is the work required to resolve the incident; SLA
        is the time allowed to do it. Work is prioritised by its due date — an explicit resolution date when one is
        set, otherwise the SLA window.
      </p>

      <Card>
        <CardHeader title="Status" subtitle="Update the incident's lifecycle status" />
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={currentStatus}
            onChange={(e) => setStatus(e.target.value as TicketStatus)}
            className="input max-w-[220px]"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--status-good)]">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </span>
          )}
          {saveError && <span className="text-sm font-medium text-[var(--status-critical)]">{saveError}</span>}
        </div>
      </Card>

      <SourceSystemNotice>
        This incident is assigned to a unit only. Employee assignment happens later, inside WorkLens.
      </SourceSystemNotice>
    </SystemPageShell>
  );
}

function Detail({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <Card className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
        {info && <InfoTip text={info} />}
      </span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </Card>
  );
}
