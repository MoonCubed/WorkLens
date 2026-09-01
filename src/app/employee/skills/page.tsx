"use client";

import { useState } from "react";
import { Plus, X, Clock } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { SkillLevelBar } from "@/components/ui/ProgressBar";
import { SkillSelect } from "@/components/skills/SkillSelect";
import { useEmployeeSession } from "@/store/session-store";
import { useEmployees } from "@/store/employees-store";
import { useSkillChangeRequests } from "@/store/skill-change-requests-store";
import type { SkillLevel } from "@/data/types";

const SKILL_LEVELS: SkillLevel[] = ["Beginner", "Intermediate", "Advanced", "Expert"];

export default function MySkillsPage() {
  const { employeeId } = useEmployeeSession();
  const { employees } = useEmployees();
  const me = employees.find((e) => e.id === employeeId) ?? employees[0];
  const { requests, submit } = useSkillChangeRequests();
  const [skillName, setSkillName] = useState("");
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("Beginner");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const myPending = requests.filter((r) => r.employeeId === me.id && r.status === "Pending");
  const pendingFor = (name: string) => myPending.find((r) => r.skillName.toLowerCase() === name.toLowerCase());

  async function raise(input: Parameters<typeof submit>[0], message: string) {
    setError(null);
    setNotice(null);
    try {
      await submit(input);
      setNotice(message);
      window.setTimeout(() => setNotice(null), 3500);
    } catch {
      setError("Couldn't send this change for approval — check your connection and try again.");
    }
  }

  async function requestAdd() {
    const name = skillName.trim();
    if (!name) return;
    if (me.skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setSkillName("");
      return;
    }
    if (pendingFor(name)) {
      setError("There's already a pending change for that skill.");
      return;
    }
    await raise(
      { employeeId: me.id, kind: "add", skillName: name, skillLevel },
      `Requested to add “${name}” — waiting for supervisor approval.`
    );
    setSkillName("");
  }

  async function requestRemove(name: string, previousLevel: SkillLevel) {
    if (pendingFor(name)) {
      setError("There's already a pending change for that skill.");
      return;
    }
    await raise(
      { employeeId: me.id, kind: "remove", skillName: name, previousLevel },
      `Requested to remove “${name}” — waiting for supervisor approval.`
    );
  }

  async function requestLevel(name: string, previousLevel: SkillLevel, nextLevel: SkillLevel) {
    if (nextLevel === previousLevel) return;
    if (pendingFor(name)) {
      setError("There's already a pending change for that skill.");
      return;
    }
    await raise(
      { employeeId: me.id, kind: "update", skillName: name, skillLevel: nextLevel, previousLevel },
      `Requested to change “${name}” to ${nextLevel} — waiting for supervisor approval.`
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">My Skills</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Changes here don&rsquo;t update your official HR record straight away — each one goes to your supervisor for
          approval first.
        </p>
      </div>

      {notice && (
        <p className="rounded-lg border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-4 py-3 text-sm text-[var(--status-good)]">
          {notice}
        </p>
      )}
      {error && <p className="text-sm font-medium text-[var(--status-critical)]">{error}</p>}

      <Card>
        <CardHeader title="Current Approved Skills" subtitle="The skills on your official HR record" />
        <div className="space-y-4">
          {me.skills.map((s) => {
            const pending = pendingFor(s.name);
            return (
              <div key={s.name} className="flex flex-wrap items-center justify-between gap-4">
                <span className="text-sm text-ink w-40 shrink-0">{s.name}</span>
                <div className="flex flex-1 items-center gap-3">
                  <SkillLevelBar level={s.level} />
                  {pending ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--status-warning)]">
                      <Clock className="h-3 w-3" />
                      Change pending
                    </span>
                  ) : (
                    <>
                      <select
                        value={s.level}
                        onChange={(e) => requestLevel(s.name, s.level, e.target.value as SkillLevel)}
                        className="input max-w-[150px] py-1.5 text-xs"
                        aria-label={`Change level for ${s.name}`}
                      >
                        {SKILL_LEVELS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => requestRemove(s.name, s.level)}
                        className="shrink-0 text-ink-muted hover:text-[var(--status-critical)]"
                        aria-label={`Request removal of ${s.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {me.skills.length === 0 && <p className="text-sm text-ink-muted">No skills on record yet — request your first one below.</p>}
        </div>

        <div className="mt-5 pt-4 border-t border-border">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-secondary">Request a New Skill</p>
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
              onClick={requestAdd}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Request Skill
            </button>
          </div>
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

      <Card>
        <CardHeader
          title="Pending Skill Changes"
          subtitle="Waiting for your supervisor to approve or reject"
        />
        {myPending.length === 0 ? (
          <p className="text-sm text-ink-muted py-2">No pending changes.</p>
        ) : (
          <ul className="divide-y divide-border">
            {myPending.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {r.kind === "add"
                      ? `Add “${r.skillName}”${r.skillLevel ? ` · ${r.skillLevel}` : ""}`
                      : r.kind === "remove"
                        ? `Remove “${r.skillName}”`
                        : `Change “${r.skillName}” · ${r.previousLevel} → ${r.skillLevel}`}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">Submitted {r.submittedAt}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2.5 py-1 text-xs font-medium text-[var(--status-warning)]">
                  <Clock className="h-3 w-3" />
                  Pending
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
