"use client";

import { useSkills } from "@/store/skills-store";

/** A `<select>` populated from the central skills catalogue. Used everywhere a
 * skill is chosen — employee skills, ticket skill requirements, filters — so skill
 * names are always picked from one consistent list rather than free-typed. */
export function SkillSelect({
  value,
  onChange,
  exclude = [],
  placeholder = "Select a skill…",
  className = "input",
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Skill names to hide from the list (e.g. ones already added). */
  exclude?: string[];
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const { skillNames } = useSkills();
  const excludeLower = exclude.map((s) => s.toLowerCase());
  const options = skillNames.filter((s) => !excludeLower.includes(s.toLowerCase()));

  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">{placeholder}</option>
      {options.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
      {/* Keep a stale/removed value visible rather than silently blanking it. */}
      {value && !skillNames.some((s) => s.toLowerCase() === value.toLowerCase()) && (
        <option value={value}>{value}</option>
      )}
    </select>
  );
}
