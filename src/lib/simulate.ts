import type { Employee } from "@/data/types";
import { getCapacityStatus } from "@/lib/capacity";

export interface ScenarioInput {
  name: string;
  startDate: string;
  durationWeeks: number;
  estimatedHours: number;
  priority: "High" | "Medium" | "Low";
  requiredSkills: string[];
}

export interface ScenarioCandidate {
  employee: Employee;
  skillMatch: number;
  currentUtilization: number;
  projectedUtilization: number;
}

export interface AllocationScenario {
  id: string;
  label: string;
  description: string;
  assignees: { employee: Employee; projected: number }[];
  overallProjected: number;
  recommended: boolean;
}

export function computeSkillMatch(employee: Employee, requiredSkills: string[]): number {
  if (requiredSkills.length === 0) return 0;
  const owned = new Set(employee.skills.map((s) => s.name.toLowerCase()));
  const matched = requiredSkills.filter((s) => owned.has(s.toLowerCase()));
  return Math.round((matched.length / requiredSkills.length) * 100);
}

export function rankCandidates(
  employees: Employee[],
  requiredSkills: string[],
  limit = 3
): { employee: Employee; skillMatch: number }[] {
  return employees
    .map((employee) => ({ employee, skillMatch: computeSkillMatch(employee, requiredSkills) }))
    .filter((c) => c.skillMatch > 0)
    .sort((a, b) => b.skillMatch - a.skillMatch || a.employee.currentUtilization - b.employee.currentUtilization)
    .slice(0, limit);
}

export function runScenario(
  employees: Employee[],
  input: ScenarioInput
): {
  candidates: ScenarioCandidate[];
  allocationScenarios: AllocationScenario[];
} {
  const hoursPerWeek = input.estimatedHours / Math.max(1, input.durationWeeks);
  const ranked = rankCandidates(employees, input.requiredSkills, 3);

  const candidates: ScenarioCandidate[] = ranked.map(({ employee, skillMatch }) => {
    const weight = 0.5 + skillMatch / 200; // 0.5–1.0, higher match carries more of the load
    const projected = Math.round(employee.currentUtilization + (hoursPerWeek / employee.weeklyHours) * 100 * weight);
    return {
      employee,
      skillMatch,
      currentUtilization: employee.currentUtilization,
      projectedUtilization: projected,
    };
  });

  const allocationScenarios: AllocationScenario[] = [];
  if (candidates[0]) {
    const c = candidates[0];
    const solo = Math.round(c.currentUtilization + (hoursPerWeek / c.employee.weeklyHours) * 100);
    allocationScenarios.push({
      id: "A",
      label: "Scenario A",
      description: `Assign to ${c.employee.name.split(" ")[0]}`,
      assignees: [{ employee: c.employee, projected: solo }],
      overallProjected: solo,
      recommended: false,
    });
  }
  if (candidates[1]) {
    const c = candidates[1];
    const solo = Math.round(c.currentUtilization + (hoursPerWeek / c.employee.weeklyHours) * 100);
    allocationScenarios.push({
      id: "B",
      label: "Scenario B",
      description: `Assign to ${c.employee.name.split(" ")[0]}`,
      assignees: [{ employee: c.employee, projected: solo }],
      overallProjected: solo,
      recommended: false,
    });
  }
  if (candidates[0] && candidates[1]) {
    const [c1, c2] = candidates;
    const availA = Math.max(5, 100 - c1.currentUtilization);
    const availB = Math.max(5, 100 - c2.currentUtilization);
    const totalAvail = availA + availB;
    const shareA = availA / totalAvail;
    const shareB = availB / totalAvail;
    const projA = Math.round(c1.currentUtilization + (hoursPerWeek * shareA / c1.employee.weeklyHours) * 100);
    const projB = Math.round(c2.currentUtilization + (hoursPerWeek * shareB / c2.employee.weeklyHours) * 100);
    allocationScenarios.push({
      id: "C",
      label: "Scenario C",
      description: `Split between ${c1.employee.name.split(" ")[0]} + ${c2.employee.name.split(" ")[0]}`,
      assignees: [
        { employee: c1.employee, projected: projA },
        { employee: c2.employee, projected: projB },
      ],
      overallProjected: Math.round((projA + projB) / 2),
      recommended: true,
    });
  }

  // Recommend the scenario with the lowest max individual projected utilization, sustainable status preferred.
  let bestIdx = 0;
  let bestScore = Infinity;
  allocationScenarios.forEach((s, idx) => {
    const maxProjected = Math.max(...s.assignees.map((a) => a.projected));
    const statusPenalty = getCapacityStatus(maxProjected).key === "critical" ? 1000 : 0;
    const score = maxProjected + statusPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });
  allocationScenarios.forEach((s, idx) => (s.recommended = idx === bestIdx));

  return { candidates, allocationScenarios };
}
