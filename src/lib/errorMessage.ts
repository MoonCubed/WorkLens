// One shared way to turn a thrown value into a real, diagnosable message — instead of
// swallowing it behind a generic "check your connection" string. A Supabase/PostgREST
// error carries `.message` (and often `.details` / `.hint` / `.code`, e.g. "42P01
// relation does not exist" when a table/column is missing, or a constraint violation);
// a plain Error has `.message`. Used everywhere a save/update can fail so the actual
// root cause — a missing table, an RLS policy, a bad constraint — is visible rather
// than hidden behind "check your connection and try again".

interface PostgrestLikeError {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

/** Best-effort human-readable detail from a thrown value, or null if nothing usable. */
export function errorDetail(err: unknown): string | null {
  if (err && typeof err === "object") {
    const e = err as PostgrestLikeError;
    const parts = [e.message, e.details, e.hint].filter((s): s is string => !!s && s.trim().length > 0);
    if (e.code) parts.push(`(${e.code})`);
    if (parts.length > 0) return parts.join(" — ");
  }
  if (err instanceof Error && err.message) return err.message;
  return null;
}

/** `fallback`, with the real error detail appended when one is available — for a
 * message that's still readable but never hides the underlying cause. */
export function withErrorDetail(fallback: string, err: unknown): string {
  const detail = errorDetail(err);
  return detail ? `${fallback}: ${detail}` : fallback;
}
