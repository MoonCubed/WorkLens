import { getCapacityStatus } from "@/lib/capacity";

export function CapacityBar({ value, showLabel = true }: { value: number; showLabel?: boolean }) {
  const status = getCapacityStatus(value);
  const width = Math.min(100, value);
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-2 flex-1 rounded-full bg-brand-50 overflow-hidden">
        <div
          className={`h-full rounded-full ${status.dot}`}
          style={{ width: `${width}%` }}
        />
        {value > 100 && (
          <div
            className="absolute top-0 h-full rounded-r-full bg-[var(--status-critical)]"
            style={{ left: "92%", width: "8%" }}
          />
        )}
      </div>
      {showLabel && <span className="tabular text-sm font-medium text-ink w-11 text-right">{value}%</span>}
    </div>
  );
}

export function SkillLevelBar({ level }: { level: "Beginner" | "Intermediate" | "Advanced" | "Expert" }) {
  const levels = ["Beginner", "Intermediate", "Advanced", "Expert"];
  const filled = levels.indexOf(level) + 1;
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        {levels.map((l, i) => (
          <span
            key={l}
            className={`h-1.5 w-5 rounded-full ${i < filled ? "bg-brand-600" : "bg-brand-50"}`}
          />
        ))}
      </div>
      <span className="text-xs text-ink-secondary">{level}</span>
    </div>
  );
}
