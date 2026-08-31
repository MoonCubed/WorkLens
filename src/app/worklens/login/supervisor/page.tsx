"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Building2 } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useEmployees } from "@/store/employees-store";
import { setStoredUnit } from "@/store/session-store";

// The supervisor demo only offers the IT Service Support unit — the same unit the
// employee demo account belongs to — so both demo logins stay consistent.
const UNIT = "IT Service Support";

export default function SupervisorLoginPage() {
  const router = useRouter();
  const { employees } = useEmployees();
  const supervisors = useMemo(
    () => employees.filter((e) => e.level === "Supervisor" && e.department === UNIT),
    [employees]
  );
  const [employeeId, setEmployeeId] = useState(supervisors[0]?.id ?? "");
  const selected = supervisors.find((e) => e.id === employeeId);

  function handleContinue() {
    if (!selected) return;
    setStoredUnit(selected.department);
    router.push("/supervisor");
  }

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="px-6 py-5">
        <Link href="/worklens" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Logo size={30} textClassName="text-xl" className="justify-center" />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">Supervisor Login</h1>
            <p className="mt-2 text-sm text-ink-secondary">No real authentication is required — select yourself.</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">Select Supervisor</p>

            <div className="space-y-1.5">
              {supervisors.map((e) => {
                const active = employeeId === e.id;
                return (
                  <button
                    key={e.id}
                    onClick={() => setEmployeeId(e.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors ${
                      active ? "border-brand-600 bg-brand-50" : "border-border-strong bg-surface hover:bg-brand-50/50"
                    }`}
                  >
                    <div className="h-8 w-8 shrink-0 rounded-full bg-brand-800 text-white text-xs font-semibold flex items-center justify-center">
                      {e.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </div>
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className={`font-medium truncate ${active ? "text-brand-800" : "text-ink"}`}>{e.name}</p>
                      <p className="flex items-center gap-1 text-xs text-ink-muted truncate">
                        <Building2 className="h-3 w-3 shrink-0" />
                        {e.department}
                      </p>
                    </div>
                    {active && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
                  </button>
                );
              })}
              {supervisors.length === 0 && (
                <p className="text-sm text-ink-muted py-4 text-center">
                  No employee is currently marked as Supervisor for {UNIT}. Set someone&apos;s Level to Supervisor in
                  the HR System first.
                </p>
              )}
            </div>

            <button
              onClick={handleContinue}
              disabled={!selected}
              className="mt-4 w-full rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      </main>

      <footer className="px-6 py-4 border-t border-border">
        <p className="text-xs text-ink-muted text-center">Prototype | Simulated Organizational Data</p>
      </footer>
    </div>
  );
}
