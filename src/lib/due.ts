// One place that turns any work item — a live ticket, a seed ad-hoc item, a seed
// "upcoming ticket" — into the single effective due date the whole app should use.
// An explicit deadline always wins; otherwise the priority's SLA window applies
// (see `resolveDueLabel` in lib/date.ts). Every list, calendar, capacity and
// status calculation reads the due date through here so they can never disagree.

import type { Ticket } from "@/data/tickets";
import type { AdhocItem, UpcomingTicket } from "@/data/types";
import { resolveDueLabel } from "@/lib/date";

export function ticketDueLabel(t: Pick<Ticket, "expectedResolutionDate" | "priority" | "raisedDate">): string {
  return resolveDueLabel(t.expectedResolutionDate, t.priority, t.raisedDate);
}

export function adhocDueLabel(a: Pick<AdhocItem, "deadline" | "priority">): string {
  return resolveDueLabel(a.deadline === "Ongoing" ? null : a.deadline, a.priority);
}

export function seedTicketDueLabel(t: Pick<UpcomingTicket, "deadline" | "priority">): string {
  return resolveDueLabel(t.deadline, t.priority);
}
