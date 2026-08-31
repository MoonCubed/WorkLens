"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

interface UseSupabaseTableResult<T> {
  rows: T[];
  loading: boolean;
  error: string | null;
  /** Re-fetch immediately — call after a write so the acting device doesn't wait
   * on the realtime round-trip to see its own change. */
  refetch: () => Promise<void>;
}

/**
 * Shared-table state backed by Supabase Postgres — the replacement for
 * `usePersistedState`'s localStorage-per-browser model. On first mount: fetch all
 * rows; if the table is empty (fresh database), seed it from `seedRows` and
 * refetch. Subscribes to realtime changes on the table so other devices' writes
 * show up without a manual reload; on any change it simply refetches the whole
 * table — these tables are small, so a full refetch is simpler and more robust
 * than patching individual rows into local state.
 *
 * This hook only reads. Each store performs its own writes via the shared
 * `supabase` client (shapes differ enough — insert vs upsert, single vs
 * composite keys — that a one-size-fits-all write helper isn't worth it) and
 * calls `refetch()` afterward.
 */
export function useSupabaseTable<T>(table: string, seedRows: T[]): UseSupabaseTableResult<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seedRef = useRef(seedRows);

  const fetchRows = useCallback(async (): Promise<T[] | null> => {
    const { data, error: fetchError } = await supabase.from(table).select("*");
    if (fetchError) {
      setError(fetchError.message);
      return null;
    }
    setError(null);
    return (data ?? []) as T[];
  }, [table]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      let data = await fetchRows();
      if (data && data.length === 0 && seedRef.current.length > 0) {
        const { error: seedError } = await supabase
          .from(table)
          .upsert(seedRef.current as unknown as Record<string, unknown>[], { onConflict: "id", ignoreDuplicates: true });
        if (seedError && !cancelled) setError(seedError.message);
        data = await fetchRows();
      }
      if (!cancelled) {
        if (data) setRows(data);
        setLoading(false);
      }
    }

    load();

    const channel = supabase
      .channel(`${table}-changes`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        fetchRows().then((data) => {
          if (data && !cancelled) setRows(data);
        });
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [table, fetchRows]);

  const refetch = useCallback(async () => {
    const data = await fetchRows();
    if (data) setRows(data);
  }, [fetchRows]);

  return { rows, loading, error, refetch };
}
