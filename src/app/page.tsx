import Link from "next/link";
import { Ticket, Users, ArrowRight, CheckCircle2 } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { SOURCE_SYSTEMS, type SourceSystem } from "@/data/systems";

const SYSTEM_ICONS: Record<SourceSystem["key"], typeof Ticket> = {
  hr: Users,
  tickets: Ticket,
};

const ACCENT_ICON_BG: Record<SourceSystem["accent"], string> = {
  amber: "bg-[var(--status-warning-bg)] text-[var(--status-warning)]",
  teal: "bg-accent-teal-bg text-accent-teal",
};

const ACCENT_TOP_BAR: Record<SourceSystem["accent"], string> = {
  amber: "bg-[var(--status-warning)]",
  teal: "bg-accent-teal",
};

const WORKLENS_CARD = {
  name: "WorkLens",
  subtitle: "Unified Capacity Platform",
  capabilities: [
    "Unified Workforce View",
    "Team Capacity",
    "Workload & Utilization",
    "Skills & Expertise Matching",
    "Task Allocation",
    "Availability & Leave",
    "Handover Management",
    "What-If Scenarios",
    "Capacity Forecasting",
  ],
  href: "/worklens",
  openLabel: "Open WorkLens",
};

export default function EnterpriseSystemsGateway() {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-6xl">
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-ink">Enterprise Systems</h1>
            <p className="mt-3 text-base text-ink-secondary max-w-xl mx-auto leading-relaxed">
              Explore the systems that provide the data behind workforce capacity planning.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
            {SOURCE_SYSTEMS.map((system) => {
              const Icon = SYSTEM_ICONS[system.key];
              return (
                <div
                  key={system.key}
                  className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
                >
                  <div className={`h-1 w-full ${ACCENT_TOP_BAR[system.accent]}`} />
                  <div className="flex flex-1 flex-col p-5">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${ACCENT_ICON_BG[system.accent]}`}>
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    </div>
                    <h2 className="mt-3 text-base font-semibold text-ink">{system.name}</h2>
                    <p className="text-xs text-ink-muted">{system.subtitle}</p>

                    <ul className="mt-3 space-y-1">
                      {system.dataProvided.map((item) => (
                        <li key={item} className="flex items-center gap-1.5 text-xs text-ink-secondary">
                          <CheckCircle2 className="h-3 w-3 shrink-0 text-ink-muted" />
                          {item}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-auto pt-4 flex items-center gap-1.5 text-xs font-medium text-[var(--status-good)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-good)]" />
                      Connected
                    </div>

                    <Link
                      href={system.href}
                      className="group mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-brand-50"
                    >
                      {system.openLabel}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </div>
              );
            })}

            <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
              <div className="h-1 w-full bg-brand-600" />
              <div className="flex flex-1 flex-col p-5">
                <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-brand-50">
                  <LogoMark size={18} />
                </div>
                <h2 className="mt-3 text-base font-semibold text-ink">{WORKLENS_CARD.name}</h2>
                <p className="text-xs text-ink-muted">{WORKLENS_CARD.subtitle}</p>

                <ul className="mt-3 space-y-1">
                  {WORKLENS_CARD.capabilities.map((item) => (
                    <li key={item} className="flex items-center gap-1.5 text-xs text-ink-secondary">
                      <CheckCircle2 className="h-3 w-3 shrink-0 text-ink-muted" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-4 flex items-center gap-1.5 text-xs font-medium text-[var(--status-good)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-good)]" />
                  Connected
                </div>

                <Link
                  href={WORKLENS_CARD.href}
                  className="group mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-brand-50"
                >
                  {WORKLENS_CARD.openLabel}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="px-6 py-4 border-t border-border">
        <p className="text-xs text-ink-muted text-center">Prototype | Simulated Organizational Data</p>
      </footer>
    </div>
  );
}
