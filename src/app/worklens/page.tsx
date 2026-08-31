import Link from "next/link";
import {
  Building2,
  ArrowRight,
  Layers,
  Sparkles,
  FlaskConical,
  Repeat2,
  Users,
  Ticket,
  Gauge,
  Clock,
  CheckCircle2,
  TrendingUp,
  Target,
  Lightbulb,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { BrowserFrame } from "@/components/marketing/BrowserFrame";

export default function WorkLensLandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <SiteHeader />
      <Hero />
      <ProblemSection />
      <FeaturesSection />
      <SupervisorSection />
      <EmployeeSection />
      <IntelligenceSection />
      <FinalCta />
      <SiteFooter />
    </div>
  );
}

/* ================================ HEADER ================================ */

function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
        <Logo size={26} textClassName="text-lg" />

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-ink hover:bg-brand-50 transition-colors"
        >
          <Building2 className="h-3.5 w-3.5" />
          Enterprise Systems
        </Link>
      </div>
    </header>
  );
}

/* ================================= HERO ================================= */

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-24 pt-16 md:pb-32 md:pt-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(55rem 30rem at 12% 0%, var(--brand-50) 0%, transparent 60%), radial-gradient(45rem 26rem at 100% 10%, var(--accent-green-bg) 0%, transparent 55%)",
        }}
      />

      <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
        <div>
          <h1 className="text-5xl md:text-6xl lg:text-[4.25rem] font-semibold tracking-tight text-ink text-balance leading-[1.05]">
            All tasks <span className="text-gradient-brand">in sight</span>
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-relaxed text-ink-secondary">
            One unified view of projects, tickets, people and capacity — helping supervisors make smarter allocation
            decisions.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/worklens/login/supervisor"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-800 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-brand-800/20 hover:bg-brand-700 transition-colors"
            >
              Login as Supervisor
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/worklens/login/employee"
              className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-6 py-3 text-sm font-semibold text-ink hover:bg-brand-50 transition-colors"
            >
              Login as Employee
            </Link>
          </div>
        </div>

        <div className="relative px-4 pt-10 pb-12 sm:px-8">
          <div className="hidden sm:flex absolute top-0 left-0 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-lg animate-float">
            <Ticket className="h-4 w-4 text-brand-600" strokeWidth={1.75} />
            <span className="text-xs font-medium text-ink">New Ticket Assigned</span>
          </div>
          <div
            className="hidden sm:flex absolute top-0 right-0 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-lg animate-float"
            style={{ animationDelay: "1.2s" }}
          >
            <Gauge className="h-4 w-4 text-[var(--status-warning)]" strokeWidth={1.75} />
            <span className="text-xs font-medium text-ink">82% Capacity</span>
          </div>
          <div
            className="hidden sm:flex absolute bottom-0 left-2 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-lg animate-float"
            style={{ animationDelay: "2.1s" }}
          >
            <Clock className="h-4 w-4 text-[var(--status-good)]" strokeWidth={1.75} />
            <span className="text-xs font-medium text-ink">3h Available</span>
          </div>
          <div
            className="hidden sm:flex absolute bottom-0 right-2 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-lg animate-float"
            style={{ animationDelay: "0.6s" }}
          >
            <Sparkles className="h-4 w-4 text-accent-green" strokeWidth={1.75} />
            <span className="text-xs font-medium text-ink">Skill Match 94%</span>
          </div>

          <BrowserFrame label="worklens.app/supervisor">
            <DashboardPreview />
          </BrowserFrame>
        </div>
      </div>
    </section>
  );
}

function DashboardPreview() {
  const bars = [58, 72, 66, 84, 91, 78, 70];
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Capacity" value="78%" tone="text-ink" />
        <MiniStat label="Available" value="22%" tone="text-[var(--status-good)]" />
        <MiniStat label="Active Work" value="24" tone="text-ink" />
        <MiniStat label="At Risk" value="3" tone="text-[var(--status-warning)]" />
      </div>
      <div className="mt-5 rounded-xl border border-border bg-surface p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Team Capacity</p>
        <div className="mt-3 flex items-end gap-2.5 h-24">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t-md bg-brand-500" style={{ height: `${h}%`, opacity: 0.55 + (i / bars.length) * 0.45 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular ${tone}`}>{value}</p>
    </div>
  );
}

/* =============================== PROBLEM ================================ */

const SOURCE_CARDS = [
  { icon: Users, title: "HR", subtitle: "Employee & Skills", accent: "text-accent-teal bg-accent-teal-bg" },
  { icon: Ticket, title: "IT Tickets", subtitle: "Operational Support", accent: "text-[var(--status-warning)] bg-[var(--status-warning-bg)]" },
];

function ProblemSection() {
  return (
    <section id="platform" className="px-6 py-24 md:py-32 border-t border-border">
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-ink">Work is everywhere</h2>
        <p className="mt-4 max-w-xl mx-auto text-base leading-relaxed text-ink-secondary">
          Tickets and employee information live across different systems. WorkLens brings them together into one
          capacity view.
        </p>

        <div className="mt-14 grid grid-cols-2 gap-4 max-w-md mx-auto">
          {SOURCE_CARDS.map((s) => (
            <div key={s.title} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className={`mx-auto h-11 w-11 rounded-xl flex items-center justify-center ${s.accent}`}>
                <s.icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <p className="mt-3 text-sm font-semibold text-ink">{s.title}</p>
              <p className="text-xs text-ink-muted">{s.subtitle}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <FlowChip label="Multiple Sources" />
          <ArrowRight className="h-4 w-4 shrink-0 rotate-90 sm:rotate-0 text-ink-muted" />
          <FlowChip label="WorkLens" dark />
          <ArrowRight className="h-4 w-4 shrink-0 rotate-90 sm:rotate-0 text-ink-muted" />
          <FlowChip label="Capacity Visibility" />
        </div>
      </div>
    </section>
  );
}

function FlowChip({ label, dark = false }: { label: string; dark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold ${
        dark ? "bg-brand-950 text-white" : "border border-border-strong bg-surface text-ink-secondary"
      }`}
    >
      {label}
    </span>
  );
}

/* =============================== FEATURES ================================ */

const FEATURES = [
  {
    icon: Layers,
    title: "Unified Workload",
    body: "Bring projects, tasks, tickets and development activities into one view.",
  },
  {
    icon: Sparkles,
    title: "Skill-Aware Allocation",
    body: "See who has the right existing skills and available capacity for each assignment.",
  },
  {
    icon: FlaskConical,
    title: "What-If Planning",
    body: "Simulate new projects, workload changes and employee absence before making allocation decisions.",
  },
  {
    icon: Repeat2,
    title: "Continuity Planning",
    body: "Identify suitable handover options when employees become unavailable.",
  },
];

function FeaturesSection() {
  return (
    <section id="features" className="px-6 py-24 md:py-32 border-t border-border bg-brand-50/30">
      <div className="mx-auto max-w-6xl">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-ink">
            Complete capacity visibility
          </h2>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-surface p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="h-11 w-11 rounded-xl bg-brand-50 flex items-center justify-center">
                <f.icon className="h-5 w-5 text-brand-600" strokeWidth={1.75} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================================ SUPERVISOR ============================== */

const SUPERVISOR_POINTS = [
  "See team workload in one place",
  "Identify overloaded and available employees",
  "View projects, tickets and tasks",
  "Match work to existing skills",
  "Simulate future workload",
  "Plan employee handovers",
];

function SupervisorSection() {
  return (
    <section id="benefits" className="px-6 py-24 md:py-32 border-t border-border">
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-ink text-balance">
            A clearer view for every supervisor
          </h2>
          <ul className="mt-8 space-y-3.5">
            {SUPERVISOR_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-3 text-sm text-ink-secondary">
                <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-[var(--status-good)]" />
                {point}
              </li>
            ))}
          </ul>
          <a
            href="#get-started"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-brand-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
          >
            Explore Supervisor View
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        <BrowserFrame label="worklens.app/supervisor/team-capacity">
          <div className="space-y-2.5">
            {[
              { name: "Sara Al-Qahtani", pct: 72, tone: "bg-[var(--status-good)]" },
              { name: "Ahmed Al-Hassan", pct: 96, tone: "bg-[var(--status-critical)]" },
              { name: "Mohammed Al-Salem", pct: 64, tone: "bg-[var(--status-good)]" },
              { name: "Fatimah Al-Mutairi", pct: 87, tone: "bg-[var(--status-warning)]" },
            ].map((row) => (
              <div key={row.name} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5">
                <div className="h-7 w-7 shrink-0 rounded-full bg-brand-800 text-white text-[10px] font-semibold flex items-center justify-center">
                  {row.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <span className="flex-1 truncate text-xs font-medium text-ink">{row.name}</span>
                <div className="h-1.5 w-16 rounded-full bg-brand-50 overflow-hidden">
                  <div className={`h-full rounded-full ${row.tone}`} style={{ width: `${Math.min(100, row.pct)}%` }} />
                </div>
                <span className="w-8 text-right text-xs tabular text-ink-secondary">{row.pct}%</span>
              </div>
            ))}
          </div>
        </BrowserFrame>
      </div>
    </section>
  );
}

/* ================================= EMPLOYEE ================================ */

const EMPLOYEE_POINTS = [
  "See assigned work",
  "Update task status",
  "Add notes",
  "Communicate with supervisor",
  "Request handover",
  "Report upcoming unavailability",
  "See personal capacity",
];

function EmployeeSection() {
  return (
    <section className="px-6 py-24 md:py-32 border-t border-border bg-brand-50/30">
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          <BrowserFrame label="worklens.app/employee">
            <div>
              <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
                <div className="relative h-16 w-16 shrink-0">
                  <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--brand-50)" strokeWidth="4" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      stroke="var(--brand-500)"
                      strokeWidth="4"
                      strokeDasharray={`${72} 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-ink">72%</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Sara Al-Qahtani</p>
                  <p className="text-xs text-ink-muted">Current capacity · Healthy</p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {["Power BI Dashboard — In Progress", "SQL Report — Not Started", "INC-1042 — Blocked"].map((item) => (
                  <div key={item} className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-xs font-medium text-ink-secondary">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </BrowserFrame>
        </div>

        <div className="order-1 lg:order-2">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-ink text-balance">
            Visibility for every employee
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {EMPLOYEE_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-3 text-sm text-ink-secondary">
                <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-[var(--status-good)]" />
                {point}
              </li>
            ))}
          </ul>
          <a
            href="#get-started"
            className="mt-8 inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink shadow-sm hover:bg-brand-50 transition-colors"
          >
            Explore Employee View
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

/* =============================== INTELLIGENCE ============================== */

const INTELLIGENCE_CARDS = [
  { icon: TrendingUp, title: "Forecast", body: "What is likely to happen if current plans continue?" },
  { icon: Target, title: "Scenario", body: "What happens if we add this project?" },
  { icon: Lightbulb, title: "Recommendation", body: "Who is the best available match based on skills and capacity?" },
];

function IntelligenceSection() {
  return (
    <section className="px-6 py-24 md:py-32 border-t border-border">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-ink">Intelligence when it matters</h2>
        <p className="mt-4 max-w-xl mx-auto text-base leading-relaxed text-ink-secondary">
          WorkLens combines real-time workload data with forecasting and scenario analysis to help supervisors
          understand what may happen next.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {INTELLIGENCE_CARDS.map((c) => (
            <div key={c.title} className="rounded-2xl border border-border bg-surface p-6 text-left shadow-sm">
              <div className="h-10 w-10 rounded-lg bg-accent-green-bg flex items-center justify-center">
                <c.icon className="h-[18px] w-[18px] text-accent-green" strokeWidth={1.75} />
              </div>
              <h3 className="mt-3 text-sm font-semibold uppercase tracking-wide text-ink">{c.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">{c.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs text-ink-muted">
          AI supports decision-making. Final allocation remains with the supervisor.
        </p>
      </div>
    </section>
  );
}

/* ================================ FINAL CTA ================================ */

function FinalCta() {
  return (
    <section id="get-started" className="relative overflow-hidden px-6 py-24 md:py-28 bg-brand-950">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(45rem 24rem at 50% 0%, rgba(76,175,80,0.25) 0%, transparent 60%)" }}
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white text-balance">
          See the work. Understand the capacity. Make the decision.
        </h2>
        <p className="mt-4 text-base text-white/70">
          WorkLens turns fragmented workforce data into actionable capacity visibility.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/worklens/login/supervisor"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-900 shadow-sm hover:bg-white/90 transition-colors"
          >
            Login as Supervisor
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/worklens/login/employee"
            className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-6 py-3 text-sm font-semibold text-white hover:bg-white/5 transition-colors"
          >
            Login as Employee
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ================================== FOOTER ================================= */

function SiteFooter() {
  return (
    <footer className="px-6 py-8 border-t border-border">
      <p className="text-xs text-ink-muted text-center">Prototype | Simulated Organizational Data</p>
    </footer>
  );
}
