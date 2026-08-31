"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, X, Check, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { SkillLevelBar } from "@/components/ui/ProgressBar";
import { useSkills } from "@/store/skills-store";
import { useEmployees } from "@/store/employees-store";
import { useTickets } from "@/store/tickets-store";
import type { SkillRecord } from "@/data/skills";
import type { SkillLevel } from "@/data/types";

const LEVEL_RANK: Record<SkillLevel, number> = { Expert: 0, Advanced: 1, Intermediate: 2, Beginner: 3 };

export default function SupervisorSkillsPage() {
  const { skills, addSkill, renameSkill, error } = useSkills();
  const { employees } = useEmployees();
  const { tickets } = useTickets();

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
          The organization&rsquo;s central skills list. Every skill picker in WorkLens — employee profiles, ticket
          requirements, What-If, filters — chooses from this list.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-4 py-3 text-sm text-[var(--status-warning)]">
          Working from the built-in skills list — changes won&rsquo;t save until the <code>skills</code> table exists
          (re-run <code>supabase/schema.sql</code>).
        </p>
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
