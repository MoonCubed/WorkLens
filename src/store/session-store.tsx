"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Department } from "@/data/types";

const UNIT_KEY = "worklens-demo:supervisor-unit";
const EMPLOYEE_KEY = "worklens-demo:employee-id";

const DEFAULT_UNIT: Department = "IT Service Support";
const DEFAULT_EMPLOYEE_ID = "sara-al-qahtani";

interface SupervisorSessionValue {
  unit: Department;
  setUnit: (unit: Department) => void;
}

const SupervisorSessionContext = createContext<SupervisorSessionValue | null>(null);

export function SupervisorSessionProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<Department>(DEFAULT_UNIT);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(UNIT_KEY) as Department | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setUnitState(stored);
    } catch {
      // Ignore — fall back to the default unit.
    }
  }, []);

  function setUnit(next: Department) {
    setUnitState(next);
    try {
      window.localStorage.setItem(UNIT_KEY, next);
    } catch {
      // Ignore.
    }
  }

  return <SupervisorSessionContext.Provider value={{ unit, setUnit }}>{children}</SupervisorSessionContext.Provider>;
}

export function useSupervisorSession() {
  const ctx = useContext(SupervisorSessionContext);
  if (!ctx) throw new Error("useSupervisorSession must be used within SupervisorSessionProvider");
  return ctx;
}

interface EmployeeSessionValue {
  employeeId: string;
  setEmployeeId: (id: string) => void;
}

const EmployeeSessionContext = createContext<EmployeeSessionValue | null>(null);

export function EmployeeSessionProvider({ children }: { children: ReactNode }) {
  const [employeeId, setEmployeeIdState] = useState<string>(DEFAULT_EMPLOYEE_ID);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(EMPLOYEE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setEmployeeIdState(stored);
    } catch {
      // Ignore — fall back to the default employee.
    }
  }, []);

  function setEmployeeId(next: string) {
    setEmployeeIdState(next);
    try {
      window.localStorage.setItem(EMPLOYEE_KEY, next);
    } catch {
      // Ignore.
    }
  }

  return (
    <EmployeeSessionContext.Provider value={{ employeeId, setEmployeeId }}>{children}</EmployeeSessionContext.Provider>
  );
}

export function useEmployeeSession() {
  const ctx = useContext(EmployeeSessionContext);
  if (!ctx) throw new Error("useEmployeeSession must be used within EmployeeSessionProvider");
  return ctx;
}

export function setStoredUnit(unit: Department) {
  try {
    window.localStorage.setItem(UNIT_KEY, unit);
  } catch {
    // Ignore.
  }
}

export function setStoredEmployeeId(id: string) {
  try {
    window.localStorage.setItem(EMPLOYEE_KEY, id);
  } catch {
    // Ignore.
  }
}
