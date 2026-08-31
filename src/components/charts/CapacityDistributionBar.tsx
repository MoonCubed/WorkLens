export function CapacityDistributionBar({
  data,
}: {
  data: { key: string; label: string; value: number; color: string }[];
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-brand-50">
        {total > 0 &&
          data
            .filter((d) => d.value > 0)
            .map((d, i) => (
              <div
                key={d.key}
                className={i > 0 ? "border-l-2 border-surface" : ""}
                style={{ width: `${(d.value / total) * 100}%`, background: d.color }}
              />
            ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {data.map((d) => (
          <div key={d.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-xs text-ink-muted">{d.label}</span>
            <span className="text-sm font-semibold text-ink tabular">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
