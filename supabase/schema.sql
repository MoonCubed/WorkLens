-- WorkLens shared backend schema.
--
-- Run this in the Supabase project's SQL editor (Database > SQL Editor > New
-- query). Works on a brand-new database and is safe to re-run: tables use
-- IF NOT EXISTS, columns use ADD COLUMN IF NOT EXISTS, policies are dropped and
-- recreated, legacy-data migrations that reference columns a fresh install never
-- had are wrapped to swallow "does not exist", and the realtime publication
-- grant ignores "already added" errors.
--
-- Column names intentionally match the app's existing TypeScript field names
-- exactly (camelCase, quoted) rather than the usual snake_case Postgres
-- convention — this lets every store read/write rows with zero mapping code
-- between the DB and the `Employee` / `Ticket` / etc. types already used
-- throughout the app.

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists employees (
  id text primary key,
  name text not null,
  department text not null,
  "level" text not null default 'Employee',
  "supervisorId" text,
  "employeeIdNumber" text,
  email text,
  "availabilityOverride" text,
  skills jsonb not null default '[]',
  "knowledgeAreas" jsonb not null default '[]',
  "workingSchedule" text,
  "weeklyHours" integer,
  workload jsonb not null default '{}',
  "currentUtilization" integer,
  "futureCapacity" integer,
  "forecast8Week" jsonb not null default '[]',
  "upcomingProjects" jsonb not null default '[]',
  "upcomingTickets" jsonb not null default '[]',
  adhoc jsonb not null default '[]',
  "leaveEvents" jsonb not null default '[]',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists tickets (
  id text primary key,
  title text not null,
  description text,
  status text not null,
  priority text not null,
  "assignedUnit" text not null,
  "assignedEmployeeId" text,
  "assignedEmployeeIds" jsonb not null default '[]',
  "raisedDate" text,
  "estimatedHours" numeric,
  "slaHours" numeric,
  "expectedResolutionDate" text,
  "resolvedDate" text,
  "holdStartDate" text,
  "holdEndDate" text,
  "createdBy" text,
  "assignedBy" text,
  "relatedSkills" jsonb,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- Projects/tickets set to "On Hold" now capture the hold window (start + expected
-- end) so the pause is visible in the task details and capacity can reason about it.
-- Completion is recorded on "resolvedDate" (set the moment status becomes Completed).
alter table tickets add column if not exists "holdStartDate" text;
alter table tickets add column if not exists "holdEndDate" text;

-- Migration for projects that already ran an earlier version of this file, before a
-- ticket could be shared by 2 employees — adds "assignedEmployeeIds" (a list) and
-- backfills it from the old single-assignee "assignedEmployeeId" column. The old
-- column is left in place rather than dropped, since it may still hold historical
-- data; the app no longer reads or writes it. Safe to re-run.
alter table tickets add column if not exists "assignedEmployeeIds" jsonb not null default '[]';
update tickets
set "assignedEmployeeIds" = jsonb_build_array("assignedEmployeeId")
where "assignedEmployeeId" is not null and "assignedEmployeeIds" = '[]'::jsonb;

-- Task statuses are now just In Progress / On Hold / Completed. Collapse any earlier
-- values (Open, Resolved, Closed, Blocked, Not Started, Queued) onto the new set.
-- (The matching work_log_entries collapse runs after that table is created, below.)
-- Safe to re-run.
alter table tickets add column if not exists "effortSplit" jsonb;
alter table tickets add column if not exists "activityAt" text;
update tickets set status = 'Completed' where status in ('Resolved', 'Closed');
update tickets set status = 'In Progress' where status not in ('In Progress', 'On Hold', 'Completed');

-- Migration for projects that already ran an earlier version of this file (the
-- CREATE TABLE above only applies to a fresh install) — adds the "level" column
-- if it's missing, backfills the six known department leads to "Supervisor", and
-- links everyone else's supervisorId to their department's lead (previously
-- everyone pointed at the placeholder "sup-001", which is why every department
-- looked like it had the same — or no — supervisor). Safe to re-run.
alter table employees add column if not exists "level" text not null default 'Employee';
update employees set "level" = 'Employee' where "level" = 'Staff';
update employees set "level" = 'Supervisor' where "level" = 'Manager';
update employees set "level" = 'Supervisor'
  where id in ('ahmed-al-hassan', 'saad-al-dawsari', 'fatimah-al-mutairi', 'khalid-al-otaibi', 'abdullah-al-harbi', 'yousef-al-ghamdi');

-- The "title" (job position) column has been removed from the app entirely —
-- drop the NOT NULL constraint so it stops rejecting new employee inserts on
-- projects that ran an earlier version of this file. The column itself is
-- left in place rather than dropped, since it may still hold historical data.
-- (Wrapped so a fresh install, where the column never existed, doesn't error.)
do $$
begin
  alter table employees alter column title drop not null;
exception
  when undefined_column then null;
end $$;

update employees set "supervisorId" = 'ahmed-al-hassan' where department = 'Data & Analytics' and id <> 'ahmed-al-hassan';
update employees set "supervisorId" = 'saad-al-dawsari' where department = 'Digital Solutions' and id <> 'saad-al-dawsari';
update employees set "supervisorId" = 'fatimah-al-mutairi' where department = 'Business Systems' and id <> 'fatimah-al-mutairi';
update employees set "supervisorId" = 'khalid-al-otaibi' where department = 'Cybersecurity' and id <> 'khalid-al-otaibi';
update employees set "supervisorId" = 'abdullah-al-harbi' where department = 'IT Service Support' and id <> 'abdullah-al-harbi';
update employees set "supervisorId" = 'yousef-al-ghamdi' where department = 'Applications' and id <> 'yousef-al-ghamdi';

-- Supervisors are the top of their own department's chain — there is no more
-- top-level "sup-001" placeholder person above them, so null out their supervisorId.
update employees set "supervisorId" = null where "level" = 'Supervisor';

create table if not exists handover_requests (
  id text primary key,
  "employeeId" text not null,
  note text,
  "startDate" text,
  "endDate" text,
  "affectedWork" jsonb not null default '[]',
  status text not null,
  "submittedAt" text,
  "leaveType" text not null default 'Leave',
  "preferredEmployeeId" text,
  "createdAt" timestamptz not null default now()
);

-- Migration for projects that already ran an earlier version of this file, before
-- leaveType existed on handover_requests (every request now doubles as a leave
-- request — approving it on the supervisor's Handover page adds a matching entry to
-- the employee's leaveEvents). Safe to re-run.
alter table handover_requests add column if not exists "leaveType" text not null default 'Leave';
-- The handover workflow's leave type is now always just "Leave"; the employee explains
-- the reason in the required justification ("note"). They can also nominate a
-- "preferredEmployeeId" they've pre-coordinated the turnover with — a recommendation
-- only; the supervisor still makes the final assignment.
alter table handover_requests add column if not exists "preferredEmployeeId" text;
alter table handover_requests alter column "leaveType" set default 'Leave';

create table if not exists work_log_entries (
  "employeeId" text not null,
  "itemId" text not null,
  "workflowStatus" text,
  progress integer,
  "completedAt" text,
  "holdStartDate" text,
  "holdEndDate" text,
  comments jsonb not null default '[]',
  "updatedAt" timestamptz not null default now(),
  primary key ("employeeId", "itemId")
);

-- Migration for projects that already ran an earlier version of this file, before
-- "progress" existed on work_log_entries — the Supervisor Dashboard's capacity
-- calculations use this (0-100, employee-logged) to compute remaining work hours per
-- item. Safe to re-run.
alter table work_log_entries add column if not exists progress integer;
-- "completedAt": the date the assignee marked this item Completed — stored so the
-- completion date survives a refresh and is visible in every view. Cleared if the item
-- is moved back out of Completed. "holdStartDate" / "holdEndDate": the hold window when
-- an item is set to On Hold.
alter table work_log_entries add column if not exists "completedAt" text;
alter table work_log_entries add column if not exists "holdStartDate" text;
alter table work_log_entries add column if not exists "holdEndDate" text;

-- Collapse any earlier workflowStatus values (Blocked, Not Started, ...) onto the
-- current set. Runs here, after the table is guaranteed to exist; a no-op on a fresh
-- (empty) database.
update work_log_entries set "workflowStatus" = 'On Hold' where "workflowStatus" = 'Blocked';
update work_log_entries set "workflowStatus" = 'In Progress'
  where "workflowStatus" is not null and "workflowStatus" not in ('In Progress', 'On Hold', 'Completed');

-- Migration for projects that already ran an earlier version of this file — the old
-- "notes" (employee-private) and "messages" (employee-to-supervisor) columns are
-- replaced by a single "comments" thread (each entry tagged with its author) that both
-- the employee and their supervisor read and write. Existing notes/messages are merged
-- into it once, in chronological append order (notes first, then messages, matching how
-- they were previously always rendered); the old columns are left in place afterwards
-- rather than dropped, since they may still hold historical data. Safe to re-run.
alter table work_log_entries add column if not exists comments jsonb not null default '[]';
-- Wrapped so a fresh install, where "notes" / "messages" never existed, doesn't error.
do $$
begin
  update work_log_entries
  set comments = (
    select coalesce(jsonb_agg(elem), '[]'::jsonb)
    from (
      select jsonb_build_object('text', n->>'text', 'at', n->>'at', 'author', 'Employee') as elem
      from jsonb_array_elements(coalesce(notes, '[]'::jsonb)) as n
      union all
      select jsonb_build_object('text', m->>'text', 'at', m->>'at', 'author', 'Employee') as elem
      from jsonb_array_elements(coalesce(messages, '[]'::jsonb)) as m
    ) merged
  )
  where comments = '[]'::jsonb and (jsonb_array_length(coalesce(notes, '[]'::jsonb)) > 0 or jsonb_array_length(coalesce(messages, '[]'::jsonb)) > 0);
exception
  when undefined_column then null;
end $$;

-- The central skills catalogue — one shared list every skill picker in the app
-- selects from (employee skills, ticket skill requirements, What-If, filters).
-- Supervisors add/rename entries from Supervisor > Skills. Seeded by the app on
-- first run from the skills already present in the employee/ticket seed data.
create table if not exists skills (
  id text primary key,
  name text not null,
  description text,
  "createdAt" timestamptz not null default now()
);

create table if not exists calendar_events (
  id text primary key,
  "authorId" text not null,
  "authorName" text not null,
  "authorRole" text not null,
  department text not null,
  title text not null,
  date text not null,
  priority text not null default 'Medium',
  "itemType" text not null default 'Task',
  note text not null default '',
  "createdAt" text not null
);

-- Migration for projects that already ran an earlier version of this file, before
-- priority/type/note existed on calendar_events. Safe to re-run.
alter table calendar_events add column if not exists priority text not null default 'Medium';
alter table calendar_events add column if not exists "itemType" text not null default 'Task';
alter table calendar_events add column if not exists note text not null default '';

-- Task adjustment requests — an employee asks their supervisor to extend a deadline,
-- change the estimated effort, revisit an assignment, etc. The supervisor reviews on
-- the Tasks page; the underlying task is only changed if they approve.
create table if not exists task_adjustment_requests (
  id text primary key,
  "ticketId" text not null,
  "employeeId" text not null,
  kind text not null,
  "requestedDeadline" text,
  "requestedHours" numeric,
  justification text not null default '',
  status text not null default 'Pending Review',
  "submittedAt" text not null
);

-- Skill-change requests — an employee's edits to their own skills (add / remove /
-- change level) are NOT written straight to the official HR skill record. Each edit
-- becomes a pending request the supervisor reviews (Supervisor -> Skills); only on
-- approval is the employee's skills list actually updated.
create table if not exists skill_change_requests (
  id text primary key,
  "employeeId" text not null,
  kind text not null,                    -- 'add' | 'remove' | 'update'
  "skillName" text not null,
  "skillLevel" text,                     -- target level for 'add' / 'update'
  "previousLevel" text,                  -- current level for 'remove' / 'update'
  status text not null default 'Pending', -- 'Pending' | 'Approved' | 'Rejected'
  "submittedAt" text not null,
  "reviewedAt" text,
  "createdAt" timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
--
-- This is a prototype with no real per-user login (both "supervisor" and
-- "employee" sign-in are identity pickers, not authentication), so policies
-- are intentionally permissive: anyone with the anon key (i.e. anyone with the
-- deployed URL) can read and write every table. The only delete policy is on
-- `employees` (the HR System can remove a person from the master dataset);
-- every other table is insert/update-only. See the README for this tradeoff.
-- ============================================================================

alter table employees enable row level security;
alter table tickets enable row level security;
alter table handover_requests enable row level security;
alter table work_log_entries enable row level security;
alter table calendar_events enable row level security;
alter table skills enable row level security;
alter table task_adjustment_requests enable row level security;
alter table skill_change_requests enable row level security;

-- RLS policies alone aren't enough — Postgres also requires the base table-level
-- privilege grant. New tables don't always inherit Supabase's default grants for
-- anon/authenticated, which surfaces as "permission denied for table X" even with
-- correct RLS policies in place. Grant explicitly so this isn't environment-dependent.
grant select, insert, update on employees, tickets, handover_requests, work_log_entries, calendar_events, skills, task_adjustment_requests, skill_change_requests to anon, authenticated;
-- The HR System is the one place allowed to remove a person from the master
-- dataset, so employees (alone) also needs the delete privilege + policy.
grant delete on employees to anon, authenticated;

drop policy if exists "anon select" on employees;
drop policy if exists "anon insert" on employees;
drop policy if exists "anon update" on employees;
drop policy if exists "anon delete" on employees;
create policy "anon select" on employees for select to anon, authenticated using (true);
create policy "anon insert" on employees for insert to anon, authenticated with check (true);
create policy "anon update" on employees for update to anon, authenticated using (true) with check (true);
create policy "anon delete" on employees for delete to anon, authenticated using (true);

drop policy if exists "anon select" on tickets;
drop policy if exists "anon insert" on tickets;
drop policy if exists "anon update" on tickets;
create policy "anon select" on tickets for select to anon, authenticated using (true);
create policy "anon insert" on tickets for insert to anon, authenticated with check (true);
create policy "anon update" on tickets for update to anon, authenticated using (true) with check (true);

drop policy if exists "anon select" on handover_requests;
drop policy if exists "anon insert" on handover_requests;
drop policy if exists "anon update" on handover_requests;
create policy "anon select" on handover_requests for select to anon, authenticated using (true);
create policy "anon insert" on handover_requests for insert to anon, authenticated with check (true);
create policy "anon update" on handover_requests for update to anon, authenticated using (true) with check (true);

drop policy if exists "anon select" on work_log_entries;
drop policy if exists "anon insert" on work_log_entries;
drop policy if exists "anon update" on work_log_entries;
create policy "anon select" on work_log_entries for select to anon, authenticated using (true);
create policy "anon insert" on work_log_entries for insert to anon, authenticated with check (true);
create policy "anon update" on work_log_entries for update to anon, authenticated using (true) with check (true);

-- calendar_events rows are meant to be private to whoever created them — the app
-- filters that client-side (same as every other "who can see what" rule in this
-- prototype, since there's no real per-user login to enforce it at the database level).
drop policy if exists "anon select" on calendar_events;
drop policy if exists "anon insert" on calendar_events;
drop policy if exists "anon update" on calendar_events;
create policy "anon select" on calendar_events for select to anon, authenticated using (true);
create policy "anon insert" on calendar_events for insert to anon, authenticated with check (true);
create policy "anon update" on calendar_events for update to anon, authenticated using (true) with check (true);

drop policy if exists "anon select" on skills;
drop policy if exists "anon insert" on skills;
drop policy if exists "anon update" on skills;
create policy "anon select" on skills for select to anon, authenticated using (true);
create policy "anon insert" on skills for insert to anon, authenticated with check (true);
create policy "anon update" on skills for update to anon, authenticated using (true) with check (true);

drop policy if exists "anon select" on task_adjustment_requests;
drop policy if exists "anon insert" on task_adjustment_requests;
drop policy if exists "anon update" on task_adjustment_requests;
create policy "anon select" on task_adjustment_requests for select to anon, authenticated using (true);
create policy "anon insert" on task_adjustment_requests for insert to anon, authenticated with check (true);
create policy "anon update" on task_adjustment_requests for update to anon, authenticated using (true) with check (true);

drop policy if exists "anon select" on skill_change_requests;
drop policy if exists "anon insert" on skill_change_requests;
drop policy if exists "anon update" on skill_change_requests;
create policy "anon select" on skill_change_requests for select to anon, authenticated using (true);
create policy "anon insert" on skill_change_requests for insert to anon, authenticated with check (true);
create policy "anon update" on skill_change_requests for update to anon, authenticated using (true) with check (true);

-- ============================================================================
-- Realtime — lets other devices see writes without a manual refresh.
-- ============================================================================

do $$
begin
  alter publication supabase_realtime add table employees, tickets, handover_requests, work_log_entries, calendar_events, skills, task_adjustment_requests, skill_change_requests;
exception
  when duplicate_object then null;
end $$;

-- Added separately so projects that already published the earlier table set (which
-- makes the combined ALTER above abort with duplicate_object before it reaches the
-- new table) still get skill_change_requests onto the realtime publication.
do $$
begin
  alter publication supabase_realtime add table skill_change_requests;
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- Cleanup — FLOW and SDLC were removed from the app. If your project already
-- ran an earlier version of this file, the `flow_projects` and `sdlc_activities`
-- tables still exist with their data. Uncomment and run this once to drop them
-- (irreversible — only run if you're sure you don't need that data):
--
-- drop table if exists flow_projects;
-- drop table if exists sdlc_activities;
