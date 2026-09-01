"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Employee } from "@/data/types";

/** Confirmation dialog for removing an employee from the HR master dataset.
 * Deleting is irreversible and the only delete the app allows (see the HR
 * System's delete policy in supabase/schema.sql), so it always goes through
 * an explicit confirm and flags the case where a supervisor is being removed. */
export function DeleteEmployeeModal({
  employee,
  employees,
  error,
  onClose,
  onConfirm,
}: {
  employee: Employee;
  employees: Employee[];
  error: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const reports =
    employee.level === "Supervisor"
      ? employees.filter((e) => e.id !== employee.id && e.department === employee.department && e.level === "Employee")
      : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">Delete Employee</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-ink-secondary">
          Remove <span className="font-semibold text-ink">{employee.name}</span> ({employee.employeeIdNumber}) from the HR
          System? This deletes their master record and can&rsquo;t be undone — WorkLens team views, logins and capacity
          planning will no longer include them.
        </p>

        {reports.length > 0 && (
          <p className="mt-3 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3.5 py-2.5 text-xs text-[var(--status-warning)]">
            {employee.name} is the supervisor for {employee.department}. {reports.length} team member
            {reports.length === 1 ? "" : "s"} will be left without a supervisor until you assign a new one.
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-3.5 py-2.5 text-xs text-[var(--status-critical)]">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-brand-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onConfirm();
              } finally {
                setSubmitting(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--status-critical)] px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            {submitting ? "Deleting…" : "Delete Employee"}
          </button>
        </div>
      </div>
    </div>
  );
}
