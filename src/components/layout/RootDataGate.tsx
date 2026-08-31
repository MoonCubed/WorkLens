"use client";

import type { ReactNode } from "react";
import { useEmployees } from "@/store/employees-store";
import { useTickets } from "@/store/tickets-store";
import { useWorkLog } from "@/store/work-log-store";
import { useHandoverRequests } from "@/store/handover-requests-store";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { CapacitySyncEngine } from "@/components/system/CapacitySyncEngine";

/** Blocks first paint until every root-level Supabase-backed store has loaded
 * once, so pages never flash an empty "0 employees" state on a slow connection.
 * `calendar_events` is deliberately not included here — it's an additive feature
 * (personal calendar entries) that non-calendar pages don't depend on, so a
 * problem with that one table shouldn't take down the rest of the app. */
export function RootDataGate({ children }: { children: ReactNode }) {
  const employees = useEmployees();
  const tickets = useTickets();
  const workLog = useWorkLog();
  const handover = useHandoverRequests();

  const loading = employees.loading || tickets.loading || workLog.loading || handover.loading;
  const error = employees.error || tickets.error || workLog.error || handover.error;

  if (loading || error) return <LoadingScreen error={error} />;
  return (
    <>
      <CapacitySyncEngine />
      {children}
    </>
  );
}
