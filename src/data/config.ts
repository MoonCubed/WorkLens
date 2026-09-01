// Capacity thresholds — centralized so status logic is never hardcoded per component.
// Utilization = total assigned hours (project + operational + ad-hoc + other) / working hours.
// The overload threshold (`atRisk.max`) is 85%: at or below it an employee is "At Risk"
// once past the 80% recommended line; above it they are treated as Overloaded. Every
// capacity indicator, assignment warning, forecast and What-If reads this one value.
export const CAPACITY_THRESHOLDS = {
  healthy: { max: 80, label: "Healthy", key: "healthy" as const },
  atRisk: { max: 85, label: "At Risk", key: "atRisk" as const },
  overloaded: { max: 100, label: "Overloaded", key: "overloaded" as const },
  critical: { max: Infinity, label: "Critical", key: "critical" as const },
};

/** The recommended capacity ceiling — sustained work above this is a planning concern. */
export const RECOMMENDED_CAPACITY = CAPACITY_THRESHOLDS.healthy.max; // 80
/** The overload threshold — utilization above this counts as overloaded everywhere. */
export const OVERLOAD_THRESHOLD = CAPACITY_THRESHOLDS.atRisk.max; // 85

export const ORG_META = {
  totalEmployees: 84,
  averageUtilization: 76,
  availableCapacity: 18,
  atRisk: 9,
  overloaded: 4,
  lastUpdated: "26 Aug 2026, 10:42 AM",
};

export const CAPACITY_FORECAST_8WK = [
  { week: "Week 1", utilization: 74 },
  { week: "Week 2", utilization: 76 },
  { week: "Week 3", utilization: 79 },
  { week: "Week 4", utilization: 83 },
  { week: "Week 5", utilization: 91 },
  { week: "Week 6", utilization: 94 },
  { week: "Week 7", utilization: 88 },
  { week: "Week 8", utilization: 82 },
];

export const CAPACITY_DISTRIBUTION = [
  { key: "healthy", label: "Healthy", value: 71 },
  { key: "atRisk", label: "At Risk", value: 9 },
  { key: "overloaded", label: "Overloaded", value: 4 },
];

export const UPCOMING_RISKS = [
  "Data & Analytics is projected to reach 94% capacity in 4 weeks.",
  "3 employees are projected to exceed the recommended capacity threshold.",
];

export const DEPARTMENTS = [
  "Data & Analytics",
  "Digital Solutions",
  "Business Systems",
  "Cybersecurity",
  "IT Service Support",
  "Applications",
] as const;

/** The demo is scoped to IT — HR and IT-Demand only show/assign within
 * these two units, even though the underlying seed data spans more departments. */
export const IT_DEPARTMENTS = ["IT Service Support", "Cybersecurity"] as const;
