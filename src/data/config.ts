// Capacity thresholds — centralized so status logic is never hardcoded per component.
// Utilization = deadline-driven planned hours for the current week / working hours.
// The overload threshold (`atRisk.max`) is 85%: at or below it an employee is "At Risk"
// once past the 80% recommended line; above it they are treated as Overloaded. Every
// capacity indicator, assignment warning and What-If reads this one value.
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
