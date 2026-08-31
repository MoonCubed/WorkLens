"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Search } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useEmployees } from "@/store/employees-store";
import { setStoredEmployeeId } from "@/store/session-store";
import { getUnitTeam } from "@/lib/hr";

// The employee demo only offers the IT Service Support unit — the same unit the
// supervisor demo account manages — so both demo logins stay consistent. Pulled from
// the shared employee directory, so a new IT Service Support hire from the HR System
// shows up here automatically.
const UNIT = "IT Service Support";

export default function EmployeeLoginPage() {
  const router = useRouter();
  const { employees } = useEmployees();
  // Supervisors sign in through the supervisor login — they aren't team members here.
  const demoEmployees = useMemo(() => getUnitTeam(UNIT, employees), [employees]);
  const [employeeId, setEmployeeId] = useState(demoEmployees[0]?.id ?? "");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return demoEmployees;
    return demoEmployees.filter((e) => e.name.toLowerCase().includes(q));
  }, [demoEmployees, query]);

  function handleContinue() {
    setStoredEmployeeId(employeeId);
    router.push("/employee");
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
            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-ink">Employee Login</h1>
            <p className="mt-2 text-sm text-ink-secondary">No real authentication is required — select yourself.</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">Select Employee</p>

            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name…"
                className="w-full rounded-lg border border-border-strong bg-surface py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {filtered.map((e) => {
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
                      <p className="text-xs text-ink-muted truncate">{e.department}</p>
                    </div>
                    {active && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="text-sm text-ink-muted py-4 text-center">No employees match.</p>}
            </div>

            <button
              onClick={handleContinue}
              className="mt-4 w-full rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
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
