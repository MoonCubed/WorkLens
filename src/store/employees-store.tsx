"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { Employee } from "@/data/types";
import { EMPLOYEES as SEED_EMPLOYEES } from "@/data/employees";
import { supabase } from "@/lib/supabase";
import { useSupabaseTable } from "@/store/use-supabase-table";

// Shared employee directory, backed by Supabase so every device sees the same
// data. The HR System writes here (profile edits, new hires); WorkLens
// supervisor/employee pages read from here, so a new IT hire shows up in the
// employee login list and the supervisor's team views on any device, not just
// the one that added them.
const TABLE = "employees";

interface EmployeesContextValue {
  employees: Employee[];
  loading: boolean;
  error: string | null;
  addEmployee: (employee: Employee) => Promise<void>;
  updateEmployee: (id: string, patch: Partial<Employee>) => Promise<void>;
  removeEmployee: (id: string) => Promise<void>;
}

const EmployeesContext = createContext<EmployeesContextValue | null>(null);

export function EmployeesProvider({ children }: { children: ReactNode }) {
  const { rows: employees, loading, error, refetch } = useSupabaseTable<Employee>(TABLE, SEED_EMPLOYEES);

  const addEmployee = useCallback(
    async (employee: Employee) => {
      const { error: insertError } = await supabase.from(TABLE).insert(employee);
      if (insertError) throw insertError;
      await refetch();
    },
    [refetch]
  );

  const updateEmployee = useCallback(
    async (id: string, patch: Partial<Employee>) => {
      const { error: updateError } = await supabase.from(TABLE).update(patch).eq("id", id);
      if (updateError) throw updateError;
      await refetch();
    },
    [refetch]
  );

  const removeEmployee = useCallback(
    async (id: string) => {
      // `.select()` returns the rows actually deleted — an empty result means the
      // row was filtered out by RLS (the DB is missing the employees delete policy
      // from supabase/schema.sql), which Postgres reports without an error.
      const { data, error: deleteError } = await supabase.from(TABLE).delete().eq("id", id).select();
      if (deleteError) throw deleteError;
      if (!data || data.length === 0) {
        throw new Error("Delete was blocked by the database — apply the latest supabase/schema.sql.");
      }
      await refetch();
    },
    [refetch]
  );

  const value = useMemo(
    () => ({ employees, loading, error, addEmployee, updateEmployee, removeEmployee }),
    [employees, loading, error, addEmployee, updateEmployee, removeEmployee]
  );

  return <EmployeesContext.Provider value={value}>{children}</EmployeesContext.Provider>;
}

export function useEmployees() {
  const ctx = useContext(EmployeesContext);
  if (!ctx) throw new Error("useEmployees must be used within EmployeesProvider");
  return ctx;
}
