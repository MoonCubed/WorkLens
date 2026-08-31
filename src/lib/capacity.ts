import { CAPACITY_THRESHOLDS } from "@/data/config";

export type CapacityKey = "healthy" | "atRisk" | "overloaded" | "critical";

export interface CapacityStatus {
  key: CapacityKey;
  label: string;
  text: string;
  bg: string;
  border: string;
  dot: string;
}

const STATUS_STYLES: Record<CapacityKey, CapacityStatus> = {
  healthy: {
    key: "healthy",
    label: "Healthy",
    text: "text-[var(--status-good)]",
    bg: "bg-[var(--status-good-bg)]",
    border: "border-[var(--status-good-border)]",
    dot: "bg-[var(--status-good)]",
  },
  atRisk: {
    key: "atRisk",
    label: "At Risk",
    text: "text-[var(--status-warning)]",
    bg: "bg-[var(--status-warning-bg)]",
    border: "border-[var(--status-warning-border)]",
    dot: "bg-[var(--status-warning)]",
  },
  overloaded: {
    key: "overloaded",
    label: "Overloaded",
    text: "text-[var(--status-serious)]",
    bg: "bg-[var(--status-serious-bg)]",
    border: "border-[var(--status-serious-border)]",
    dot: "bg-[var(--status-serious)]",
  },
  critical: {
    key: "critical",
    label: "Critical",
    text: "text-[var(--status-critical)]",
    bg: "bg-[var(--status-critical-bg)]",
    border: "border-[var(--status-critical-border)]",
    dot: "bg-[var(--status-critical)]",
  },
};

/** Centralized, configurable capacity-status logic. See src/data/config.ts for thresholds. */
export function getCapacityStatus(utilization: number): CapacityStatus {
  if (utilization <= CAPACITY_THRESHOLDS.healthy.max) return STATUS_STYLES.healthy;
  if (utilization <= CAPACITY_THRESHOLDS.atRisk.max) return STATUS_STYLES.atRisk;
  if (utilization <= CAPACITY_THRESHOLDS.overloaded.max) return STATUS_STYLES.overloaded;
  return STATUS_STYLES.critical;
}

export function availableCapacity(utilization: number): number {
  return Math.max(0, Math.round((100 - utilization) * 10) / 10);
}
