# WorkLens

**All tasks, in sight.**

WorkLens is a prototype workforce capacity-management platform. It demonstrates how a
unified supervisor/employee experience can sit on top of an organization's existing
systems — showing who's working on what, who has capacity, and what comes next —
without requiring those systems to change.

This is a demo built with simulated organizational data. Nothing here is a real
integration; it's a working prototype meant to show the product concept end to end.

**Live demo:** [worklens-ten.vercel.app](https://worklens-ten.vercel.app/)

## The two-layer concept

The app is split into two conceptual layers, and the UI deliberately keeps them
looking distinct:

- **Enterprise Systems** (`/systems/*`) — mock source-of-truth systems an org already
  has: an **HR System** (employee master data) and **IT-Demand**. Each has
  its own look, its own "Sync" affordance, and its own data. The demo is scoped to the
  IT Service Support and Cybersecurity units — HR only shows employees in those units,
  and tickets can only be routed to them.
- **WorkLens** (`/worklens`, `/supervisor/*`, `/employee/*`) — the unified capacity
  platform supervisors and employees actually use, built from data that flows in from
  the systems above.

A core rule baked into the data model: **tickets are assigned to a unit, not a
person.** IT-Demand only knows which team owns a piece of work; deciding
which employee on that team actually picks it up happens inside WorkLens, on the
Supervisor **Tasks** page.

## Getting started

WorkLens needs a Supabase project for its shared data (see [Shared backend](#shared-backend)
below) — the app fails fast at build/start time if the two env vars aren't set.

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project's URL + anon key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — this is the Enterprise Systems
gateway. From there, the **Enterprise Systems** button in the WorkLens header (or the
sidebar, once inside the app) gets you back to it.

## Demo accounts

No real authentication — both login screens just let you pick an identity.

- **Supervisor**: `supervisor@worklens.demo` / `demo123` (Nasser Al-Fahad, managing
  the IT Service Support unit)
- **Employee**: pick any employee shown on the login screen (IT Service Support unit,
  matching the supervisor above)

## How the demo data works

Every system's data (employees, tickets, handover requests, per-item notes/status)
lives in a shared Supabase Postgres database — the
same data every device and every visitor sees, updating live via Supabase Realtime.
Ticket assignment is the one place data crosses from an Enterprise System into
WorkLens, without a manual sync step — the same way an HR System hire or profile edit
is immediately reflected in WorkLens employee lists, on any device.

The one thing that stays local to a browser is which identity you're "logged in" as
(`supervisor-unit` / `employee-id` in `localStorage`) — that's session state, not
shared data, so a phone and a laptop can legitimately be signed in as different
people at the same time.

## Shared backend

WorkLens uses [Supabase](https://supabase.com) (hosted Postgres + realtime) as its
shared backend, talked to directly from the browser with the public anon key —
that's safe by design, since access is governed by the Row Level Security policies
in [`supabase/schema.sql`](supabase/schema.sql), not by keeping the key secret.

**Setup:**
1. Create a free Supabase project.
2. In its SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql) once — it
   creates all four tables, RLS policies, and enables realtime. Safe to re-run.
3. From Project Settings > API, copy the Project URL and anon/public key into
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (locally in
   `.env.local`, and in whatever hosts the deployment — see below).
4. First page load seeds the tables from the app's demo dataset automatically.

**Tables:** `employees`, `tickets`, `handover_requests`, `work_log_entries` — column
names match the TypeScript types in `src/data/*` field-for-field.

**Deploying (Vercel or Azure):** set the same two `NEXT_PUBLIC_SUPABASE_*` env vars
in the host's environment/configuration settings before building — the app throws at
build time if they're missing, so a misconfigured deploy fails loudly rather than
shipping broken. On Azure, this is under the Static Web App or App Service resource's
Configuration / Application settings.

**Limitations:** there's no real per-user login in this prototype (both "supervisor"
and "employee" sign-in are identity pickers), so the RLS policies are permissive —
anyone with the deployed URL can read and write all demo data. Fine for a prototype
with fictional org data; would need real auth to restrict further. A fresh free-tier
Supabase project also pauses after a week with no activity — opening the dashboard
un-pauses it.

## Key pages

| Area | Pages |
|---|---|
| Enterprise Systems | Gateway (`/`), HR System, IT-Demand |
| WorkLens | Landing page, Supervisor login, Employee login |
| Supervisor | Dashboard, Team Capacity, Calendar, Tasks, What-If Simulator, Handover Planner |
| Employee | Dashboard, My Work, My Skills, Handover Requests |

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router, Turbopack)
- React 19 + TypeScript
- Tailwind CSS v4
- [Supabase](https://supabase.com) (Postgres + Realtime) for shared data
- [Recharts](https://recharts.org) for charts, [lucide-react](https://lucide.dev) for icons

## Scripts

```bash
npm run dev      # start the dev server
npm run build    # production build
npm run start    # run the production build
npm run lint     # eslint
```
