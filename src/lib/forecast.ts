export function toWeekSeries(values: number[]) {
  return values.map((utilization, i) => ({ week: `Week ${i + 1}`, utilization }));
}
