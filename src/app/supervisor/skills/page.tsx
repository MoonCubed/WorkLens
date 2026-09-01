"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, X, Check, ChevronDown, ChevronRight, Inbox } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { SkillLevelBar } from "@/components/ui/ProgressBar";
import { SkillSelect } from "@/components/skills/SkillSelect";
import { useSkills } from "@/store/skills-store";
import { useEmployees } from "@/store/employees-store";
import { useTickets } from "@/store/tickets-store";
import { useSupervisorSession } from "@/store/session-store";
import { useSkillChangeRequests, type SkillChangeRequest } from "@/store/skill-change-requests-store";
import { getUnitTeam } from "@/lib/hr";
import type { SkillRecord } from "@/data/skills";
import type { Skill, SkillLevel } from "@/data/types";

const LEVEL_RANK: Record<SkillLevel, number> = { Expert: 0, Advanced: 1, Intermediate: 2, Beginner: 3 };
const SKILL_LEVELS: SkillLevel[] = ["Beginner", "Intermediate", "Advanced", "Expert"];

export default function SupervisorSkillsPage() {
  const { skills, addSkill, renameSkill, error } = useSkills();
  const { employees, updateEmployee } = useEmployees();
  const { tickets } = useTickets();
  const { unit } = useSupervisorSession();
  const { requests: skillChangeRequests, resolve: resolveSkillChange } = useSkillChangeRequests();
  const [reviewError, setReviewError] = useState<string | null>(null);

  const unitTeam = useMemo(() => getUnitTeam(unit, employees), [unit, employees]);
  const unitIds = useMemo(() => new Set(unitTeam.map((e) => e.id)), [unitTeam]);
  // Skill-change requests from this supervisor's own team, still awaiting a decision.
  const pendingSkillChanges = skillChangeRequests.filter((r) => r.status === "Pending" && unitIds.has(r.employeeId));

  // --- Assign a skill directly to a team member (supervisor action, no approval) ---
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assignSkillName, setAssignSkillName] = useState("");
  const [assignLevel, setAssignLevel] = useState<SkillLevel>("Intermediate");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignNotice, setAssignNotice] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const assignEmployee = unitTeam.find((e) => e.id === assignEmployeeId) ?? unitTeam[0];

  async function assignSkill() {
    if (!assignEmployee) return;
    const name = assignSkillName.trim();
    if (!name) return;
    setAssignBusy(true);
    setAssignError(null);
    setAssignNotice(null);
    const existing = assignEmployee.skills.find((s) => s.name.toLowerCase() === name.toLowerCase());
    const nextSkills: Skill[] = existing
      ? assignEmployee.skills.map((s) =>
          s.name.toLowerCase() === name.toLowerCase() ? { ...s, level: assignLevel } : s
        )
      : [...assignEmployee.skills, { name, level: assignLevel }];
    try {
      await updateEmployee(assignEmployee.id, { skills: nextSkills });
      setAssignNotice(
        existing
          ? `Updated ${assignEmployee.name}'s ${name} level to ${assignLevel}.`
          : `Added ${name} (${assignLevel}) to ${assignEmployee.name}.`
      );
      setAssignSkillName("");
      window.setTimeout(() => setAssignNotice(null), 3500);
    } catch {
      setAssignError("Couldn't save this change — check your connection and try again.");
    } finally {
      setAssignBusy(false);
    }
  }

  /** Approve → apply the change to the employee's official skills, then mark reviewed. */
  async function approveSkillChange(req: SkillChangeRequest) {
    setReviewError(null);
    const emp = employees.find((e) => e.id === req.employeeId);
    if (!emp) return;
    const lower = req.skillName.toLowerCase();
    let nextSkills: Skill[] = emp.skills;
    if (req.kind === "add" && !emp.skills.some((s) => s.name.toLowerCase() === lower)) {
      nextSkills = [...emp.skills, { name: req.skillName, level: (req.skillLevel ?? "Beginner") as SkillLevel }];
    } else if (req.kind === "remove") {
      nextSkills = emp.skills.filter((s) => s.name.toLowerCase() !== lower);
    } else if (req.kind === "update") {
      nextSkills = emp.skills.map((s) =>
        s.name.toLowerCase() === lower ? { ...s, level: (req.skillLevel ?? s.level) as SkillLevel } : s
      );
    }
    try {
      if (nextSkills !== emp.skills) await updateEmployee(emp.id, { skills: nextSkills });
      await resolveSkillChange(req.id, "Approved");
    } catch {
      setReviewError("Couldn't apply this skill change — check your connection and try again.");
    }
  }

  async function rejectSkillChange(req: SkillChangeRequest) {
    setReviewError(null);
    try {
      await resolveSkillChange(req.id, "Rejected");
    } catch {
      setReviewError("Couldn't reject this request — check your connection and try again.");
    }
  }

  const nameFor = (id: string) => employees.find((e) => e.id === id)?.name ?? id;
  const describeChange = (r: SkillChangeRequest) =>
    r.kind === "add"
      ? `wants to add “${r.skillName}”${r.skillLevel ? ` (${r.skillLevel})` : ""}`
      : r.kind === "remove"
        ? `wants to remove “${r.skillName}”`
        : `wants to change “${r.skillName}” from ${r.previousLevel} to ${r.skillLevel}`;

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // Everyone who holds each skill, with their proficiency level (highest first).
  const holdersBySkill = useMemo(() => {
    const map = new Map<string, { id: string; name: string; level: SkillLevel }[]>();
    employees.forEach((e) => {
      e.skills.forEach((s) => {
        const key = s.name.toLowerCase();
        const list = map.get(key) ?? [];
        list.push({ id: e.id, name: e.name, level: s.level });
        map.set(key, list);
      });
    });
    for (const [key, list] of map) {
      list.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.name.localeCompare(b.name));
      map.set(key, list);
    }
    return map;
  }, [employees]);

  // How many open tickets ask for each skill — so a supervisor can see which
  // catalogue entries are actually in use.
  const ticketUsage = useMemo(() => {
    const byTicket = new Map<string, number>();
    tickets.forEach((t) => (t.relatedSkills ?? []).forEach((s) => byTicket.set(s.toLowerCase(), (byTicket.get(s.toLowerCase()) ?? 0) + 1)));
    return byTicket;
  }, [tickets]);

  async function handleAdd() {
    const name = newName.trim();
    if (!name || busy) return;
    if (skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setFormError("That skill is already in the catalogue.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await addSkill(name, newDesc);
      setNewName("");
      setNewDesc("");
    } catch {
      setFormError("Couldn't save this skill — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(skill: SkillRecord) {
    setEditingId(skill.id);
    setEditName(skill.name);
    setEditDesc(skill.description ?? "");
    setFormError(null);
  }

  async function saveEdit() {
    const name = editName.trim();
    if (!name || !editingId || busy) return;
    if (skills.some((s) => s.id !== editingId && s.name.toLowerCase() === name.toLowerCase())) {
      setFormError("Another skill already has that name.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await renameSkill(editingId, name, editDesc);
      setEditingId(null);
    } catch {
      setFormError("Couldn't save this change — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Skills</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The organization&rsquo;s central skills list — add and edit entries here, and every skill picker in WorkLens
          (employee profiles, ticket requirements, What-If, filters) chooses from it. Assign skills to your team and
          review employee skill-change requests below.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3 text-sm text-[var(--status-warning)]">
          Working from the built-in skills list — changes won&rsquo;t save until the <code>skills</code> table exists
          (re-run <code>supabase/schema.sql</code>).
        </p>
      )}

      {reviewError && <p className="text-sm font-medium text-[var(--status-critical)]">{reviewError}</p>}

      {pendingSkillChanges.length > 0 && (
        <Card>
          <CardHeader
            title="Pending Skill Changes"
            subtitle="Employee-requested changes to their skills — the official record only updates on approval"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2.5 py-1 text-xs font-medium text-[var(--status-warning)]">
                <Inbox className="h-3.5 w-3.5" />
                {pendingSkillChanges.length} pending
              </span>
            }
          />
          <ul className="divide-y divide-border">
            {pendingSkillChanges.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    <Link
                      href={`/supervisor/people/${r.employeeId}`}
                      className="font-medium hover:text-brand-700 hover:underline underline-offset-2"
                    >
                      {nameFor(r.employeeId)}
                    </Link>{" "}
                    {describeChange(r)}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">Submitted {r.submittedAt}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => rejectSkillChange(r)}
                    className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-brand-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => approveSkillChange(r)}
                    className="rounded-lg bg-brand-800 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    Approve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Add a skill" subtitle="New skills become available in every picker immediately" />
        <div className="flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-[200px]">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Skill name</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="e.g. Kubernetes"
              className="input"
            />
          </label>
          <label className="block flex-1 min-w-[200px]">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">
              Description <span className="text-ink-muted normal-case">(optional)</span>
            </span>
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="input" />
          </label>
          <button
            onClick={handleAdd}
            disabled={busy || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add Skill
          </button>
        </div>
        {formError && <p className="mt-2 text-xs font-medium text-[var(--status-critical)]">{formError}</p>}
      </Card>

      <Card>
        <CardHeader
          title="Assign a skill to a team member"
          subtitle="Picks from the central list · updates the employee's official skills straight away (supervisor action — no approval needed)"
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_170px_auto] sm:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Employee</span>
            <select value={assignEmployeeId} onChange={(e) => setAssignEmployeeId(e.target.value)} className="input">
              {unitTeam.length === 0 && <option value="">No team members</option>}
              {unitTeam.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Skill</span>
            <SkillSelect value={assignSkillName} onChange={setAssignSkillName} exclude={[]} aria-label="Skill" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Level</span>
            <select value={assignLevel} onChange={(e) => setAssignLevel(e.target.value as SkillLevel)} className="input">
              {SKILL_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={assignSkill}
            disabled={assignBusy || !assignSkillName.trim() || !assignEmployee}
            className="inline-flex h-[42px] items-center justify-center gap-1.5 rounded-lg bg-brand-800 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Assign
          </button>
        </div>
        {assignNotice && <p className="mt-2 text-xs font-medium text-[var(--status-good)]">{assignNotice}</p>}
        {assignError && <p className="mt-2 text-xs font-medium text-[var(--status-critical)]">{assignError}</p>}
      </Card>

      <Card>
        <CardHeader title={`All skills (${skills.length})`} subtitle="Click a skill to see who has it; use Edit to rename it" />
        <ul className="divide-y divide-border">
          {skills.map((skill) => {
            const holders = holdersBySkill.get(skill.name.toLowerCase()) ?? [];
            const people = holders.length;
            const ticketCount = ticketUsage.get(skill.name.toLowerCase()) ?? 0;
            const isEditing = editingId === skill.id;
            const isOpen = openId === skill.id;
            return (
              <li key={skill.id} className="py-3">
                {isEditing ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block flex-1 min-w-[180px]">
                      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Name</span>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input" autoFocus />
                    </label>
                    <label className="block flex-1 min-w-[180px]">
                      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-secondary">Description</span>
                      <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="input" />
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        disabled={busy || !editName.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-brand-50"
                      >
                        <X className="h-3.5 w-3.5" /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : skill.id)}
                        className="flex min-w-0 items-start gap-2 text-left"
                        aria-expanded={isOpen}
                      >
                        {isOpen ? (
                          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                        ) : (
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                        )}
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ink">{skill.name}</span>
                          {skill.description && <span className="block text-xs text-ink-muted mt-0.5">{skill.description}</span>}
                          <span className="block text-xs text-ink-muted mt-0.5">
                            {people} {people === 1 ? "person" : "people"} · {ticketCount} ticket{ticketCount === 1 ? "" : "s"}
                          </span>
                        </span>
                      </button>
                      <button
                        onClick={() => startEdit(skill)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-brand-50"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    </div>

                    {isOpen && (
                      <div className="mt-3 ml-6 rounded-lg border border-border bg-brand-50/30 p-3">
                        {holders.length === 0 ? (
                          <p className="text-xs text-ink-muted">Nobody on record has this skill yet.</p>
                        ) : (
                          <ul className="space-y-2.5">
                            {holders.map((h) => (
                              <li key={h.id} className="flex items-center justify-between gap-4">
                                <Link
                                  href={`/supervisor/people/${h.id}`}
                                  className="text-sm font-medium text-ink hover:text-brand-700 hover:underline underline-offset-2"
                                >
                                  {h.name}
                                </Link>
                                <span className="flex items-center gap-2">
                                  <SkillLevelBar level={h.level} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
