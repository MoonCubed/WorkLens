export const DEFAULT_SCENARIO_PROJECT = {
  name: "Server Infrastructure Upgrade",
  startDate: "01 September 2026",
  durationWeeks: 8,
  estimatedHours: 240,
  priority: "High" as const,
  requiredSkills: ["Networking", "Windows Server", "VMware"],
};

export const RECOMMENDATION_REASONS = [
  "Required skills covered",
  "Strong skill match",
  "Sufficient available capacity",
  "No major deadline conflicts",
  "Lower projected overload risk",
  "Maintains sustainable capacity",
];
