"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useSupabaseTable } from "@/store/use-supabase-table";
import { SEED_SKILLS, slugifySkill, type SkillRecord } from "@/data/skills";

// The central skills catalogue — one shared list every skill picker selects from,
// so skill names stay consistent instead of being free-typed differently in each
// place. Supervisors add and rename skills from Supervisor → Skills.
//
// Deliberately NOT part of RootDataGate's blocking load (same as calendar_events):
// if a project hasn't re-run schema.sql to create the `skills` table yet, the app
// still works off the seed list rather than showing a hard error.
const TABLE = "skills";

interface SkillsContextValue {
  skills: SkillRecord[];
  /** Just the names, sorted — the shape most pickers want. */
  skillNames: string[];
  loading: boolean;
  error: string | null;
  addSkill: (name: string, description?: string) => Promise<void>;
  renameSkill: (id: string, name: string, description?: string) => Promise<void>;
}

const SkillsContext = createContext<SkillsContextValue | null>(null);

export function SkillsProvider({ children }: { children: ReactNode }) {
  const { rows, loading, error, refetch } = useSupabaseTable<SkillRecord>(TABLE, SEED_SKILLS);

  // Fall back to the seed list if the table is empty or unavailable, so pickers are
  // never blank.
  const skills = rows.length > 0 ? rows : SEED_SKILLS;

  const addSkill = useCallback(
    async (name: string, description?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return;
      const record: SkillRecord = { id: slugifySkill(trimmed), name: trimmed, description: description?.trim() || undefined };
      const { error: insertError } = await supabase.from(TABLE).upsert(record, { onConflict: "id" });
      if (insertError) throw insertError;
      await refetch();
    },
    [skills, refetch]
  );

  const renameSkill = useCallback(
    async (id: string, name: string, description?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const { error: updateError } = await supabase
        .from(TABLE)
        .update({ name: trimmed, description: description?.trim() || null })
        .eq("id", id);
      if (updateError) throw updateError;
      await refetch();
    },
    [refetch]
  );

  const skillNames = useMemo(() => skills.map((s) => s.name).sort((a, b) => a.localeCompare(b)), [skills]);

  const value = useMemo(
    () => ({ skills: [...skills].sort((a, b) => a.name.localeCompare(b.name)), skillNames, loading, error, addSkill, renameSkill }),
    [skills, skillNames, loading, error, addSkill, renameSkill]
  );

  return <SkillsContext.Provider value={value}>{children}</SkillsContext.Provider>;
}

export function useSkills() {
  const ctx = useContext(SkillsContext);
  if (!ctx) throw new Error("useSkills must be used within SkillsProvider");
  return ctx;
}
