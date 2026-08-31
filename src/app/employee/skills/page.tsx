"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { SkillLevelBar } from "@/components/ui/ProgressBar";
import { SkillSelect } from "@/components/skills/SkillSelect";
import { useEmployeeSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";
import type { SkillLevel } from "@/data/types";

const SKILL_LEVELS: SkillLevel[] = ["Beginner", "Intermediate", "Advanced", "Expert"];

export default function MySkillsPage() {
  const { employeeId } = useEmployeeSession();
  const { employees, updateEmployee } = useEmployees();
  const me = employees.find((e) => e.id === employeeId) ?? employees[0];
  const [skillName, setSkillName] = useState("");
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("Beginner");
  const [error, setError] = useState<string | null>(null);

  async function addSkill() {
    const name = skillName.trim();
    if (!name || me.skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setSkillName("");
      return;
    }
    setError(null);
    try {
      await updateEmployee(me.id, { skills: [...me.skills, { name, level: skillLevel }] });
      setSkillName("");
    } catch {
      setError("Couldn't save this skill — check your connection and try again.");
    }
  }

  async function removeSkill(name: string) {
    setError(null);
    try {
      await updateEmployee(me.id, { skills: me.skills.filter((s) => s.name !== name) });
    } catch {
      setError("Couldn't remove this skill — check your connection and try again.");
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">My Skills</h1>
        <p className="mt-1 text-sm text-ink-muted">Editable — changes show up in HR and everywhere else immediately.</p>
      </div>

      <Card>
        <CardHeader title="Skills" />
        <div className="space-y-4">
          {me.skills.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink w-40 shrink-0">{s.name}</span>
              <div className="flex flex-1 items-center gap-3">
                <SkillLevelBar level={s.level} />
                <button
                  onClick={() => removeSkill(s.name)}
                  className="shrink-0 text-ink-muted hover:text-[var(--status-critical)]"
                  aria-label={`Remove ${s.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {me.skills.length === 0 && <p className="text-sm text-ink-muted">No skills on record yet — add your first one below.</p>}
        </div>

        <div className="mt-5 pt-4 border-t border-border">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-secondary">Add a Skill</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[220px]">
              <SkillSelect
                value={skillName}
                onChange={setSkillName}
                exclude={me.skills.map((s) => s.name)}
                aria-label="Skill"
              />
            </div>
            <select value={skillLevel} onChange={(e) => setSkillLevel(e.target.value as SkillLevel)} className="input max-w-[160px]">
              {SKILL_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button
              onClick={addSkill}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Add Skill
            </button>
          </div>
          {error && <p className="mt-2 text-xs font-medium text-[var(--status-critical)]">{error}</p>}
        </div>

        {me.knowledgeAreas.length > 0 && (
          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-secondary mb-2">Knowledge Areas</p>
            <div className="flex flex-wrap gap-1.5">
              {me.knowledgeAreas.map((k) => (
                <span key={k} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-800">
                  {k}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
