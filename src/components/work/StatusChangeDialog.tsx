"use client";

import { useState } from "react";
import { AlertTriangle, PauseCircle, X } from "lucide-react";
import { todayLabel, toInputDateValue, formatDisplayDate } from "@/lib/date";

export interface HoldDates {
  holdStartDate: string;
  holdEndDate: string;
}

/** Confirmation step shown before a work item moves into a status that needs one:
 *
 *  - "Completed" — a small "are you sure?" so an item isn't finished by accident.
 *    Completing removes it from the assignee's active workload and stamps a
 *    completion date.
 *  - "On Hold" — captures the hold window (start + expected end) so the pause is
 *    visible in the task details and capacity can reason about it.
 *
 * `onConfirm` receives the hold window for "On Hold", nothing for "Completed".
 */
export function StatusChangeDialog({
  target,
  itemTitle,
  onCancel,
  onConfirm,
}: {
  target: "Completed" | "On Hold";
  itemTitle: string;
  onCancel: () => void;
  onConfirm: (hold?: HoldDates) => void;
}) {
  const todayInput = toInputDateValue(todayLabel());
  const [start, setStart] = useState(todayInput);
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const invalidRange = target === "On Hold" && !!end && new Date(`${end}T00:00:00`) < new Date(`${start}T00:00:00`);
  const canConfirm = target === "Completed" || (!!start && !!end && !invalidRange);

  function confirm() {
    if (!canConfirm || busy) return;
    setBusy(true);
    if (target === "On Hold") {
      onConfirm({
        holdStartDate: formatDisplayDate(new Date(`${start}T00:00:00`)),
        holdEndDate: formatDisplayDate(new Date(`${end}T00:00:00`)),
      });
    } else {
      onConfirm();
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 px-4 py-8" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {target === "Completed" ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-warning)]" strokeWidth={2} />
            ) : (
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-ink-secondary" strokeWidth={2} />
            )}
            <div>
              <h2 className="text-base font-semibold text-ink">
                {target === "Completed" ? "Mark this task as completed?" : "Put this task on hold"}
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
                {target === "Completed" ? (
                  <>
                    Are you sure you want to mark <span className="font-medium text-ink">{itemTitle}</span> as completed?
                    It will be removed from your active workload and dated today.
                  </>
                ) : (
                  <>
                    <span className="font-medium text-ink">{itemTitle}</span> stays in your workload while on hold. Set
                    the hold period so everyone can see when it&rsquo;s expected to resume.
                  </>
                )}
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="shrink-0 text-ink-muted hover:text-ink" aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>

        {target === "On Hold" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Hold Start Date</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Expected Hold End Date</span>
              <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className="input" />
            </label>
            {invalidRange && (
              <p className="sm:col-span-2 text-xs font-medium text-[var(--status-critical)]">
                The expected end date can&rsquo;t be before the start date.
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-brand-50"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!canConfirm || busy}
            className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {target === "Completed" ? "Yes, mark completed" : "Put on hold"}
          </button>
        </div>
      </div>
    </div>
  );
}
