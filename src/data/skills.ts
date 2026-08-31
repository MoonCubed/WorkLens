// The organization's central skills catalogue — the single list every skill
// picker in the app selects from (employee skills, ticket skill requirements,
// What-If required skills, Team Capacity filters). Supervisors manage it from
// Supervisor → Skills. Seeded here from the skills that already appear across the
// employee and ticket seed data so nothing is missing on first run.

export interface SkillRecord {
  /** Stable id — also the row's primary key in Supabase. */
  id: string;
  name: string;
  /** Optional short description a supervisor can add when defining the skill. */
  description?: string;
}

const NAMES = [
  "Python",
  "SQL",
  "Power BI",
  "Data Analytics",
  "Machine Learning",
  "Tableau",
  "DAX",
  "ETL",
  "Airflow",
  "ERP",
  "SAP",
  "Business Analysis",
  "Process Mapping",
  "Documentation",
  "SIEM",
  "Penetration Testing",
  "Network Security",
  "Incident Response",
  "Threat Intelligence",
  "Risk Assessment",
  "Compliance",
  "ISO 27001",
  "Windows Server",
  "VMware",
  "Networking",
  "Firewalls",
  "Cisco",
  "Routing & Switching",
  "AWS",
  "Azure",
  "Terraform",
  "Java",
  "Spring Boot",
  "REST APIs",
  "Node.js",
  "PostgreSQL",
  "React",
  "TypeScript",
  "UI/UX",
  "Figma",
  "User Research",
  "Prototyping",
  "Test Automation",
  "Selenium",
  "Agile",
  "Stakeholder Management",
  "Roadmapping",
];

export function slugifySkill(name: string): string {
  return `skill-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

export const SEED_SKILLS: SkillRecord[] = NAMES.map((name) => ({ id: slugifySkill(name), name }));
