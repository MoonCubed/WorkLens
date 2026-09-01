// Registry of the organization's existing systems that WorkLens connects to. Both the
// Enterprise Systems gateway and each system's own page render from this single source
// so the "connected" story stays consistent everywhere.

export type SystemKey = "hr" | "tickets";
export type ConnectionStatus = "Connected" | "Syncing";

export interface SourceSystem {
  key: SystemKey;
  name: string;
  subtitle: string;
  dataProvided: string[];
  status: ConnectionStatus;
  lastSync: string;
  href: string;
  openLabel: string;
  accent: "amber" | "teal";
}

export const SOURCE_SYSTEMS: SourceSystem[] = [
  {
    key: "hr",
    name: "HR System",
    subtitle: "Employee & Skills Data",
    dataProvided: [
      "Employees",
      "Positions",
      "Departments",
      "Supervisors",
      "Skills",
      "Knowledge Areas",
      "Working Hours",
      "Availability",
    ],
    status: "Connected",
    lastSync: "26 Aug 2026, 10:42 AM",
    href: "/systems/hr",
    openLabel: "Open HR System",
    accent: "teal",
  },
  {
    key: "tickets",
    name: "IT-Demand",
    subtitle: "Operational Support",
    dataProvided: ["Incidents", "Requests", "Priority", "Status", "Assigned Unit", "Estimated Effort", "Dates", "SLA"],
    status: "Connected",
    lastSync: "26 Aug 2026, 10:40 AM",
    href: "/systems/tickets",
    openLabel: "Open IT-Demand",
    accent: "amber",
  },
];

export function getSourceSystem(key: SystemKey): SourceSystem {
  const system = SOURCE_SYSTEMS.find((s) => s.key === key);
  if (!system) throw new Error(`Unknown source system: ${key}`);
  return system;
}
