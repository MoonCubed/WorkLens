import { Loader2 } from "lucide-react";
import { Logo } from "./Logo";

/** Full-screen branded loading/error state, shown while a page's Supabase-backed
 * data is fetched for the first time. */
export function LoadingScreen({ error }: { error?: string | null }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-page px-4">
      <Logo size={32} textClassName="text-xl" />
      {error ? (
        <p className="max-w-sm text-center text-sm text-[var(--status-critical)]">
          Couldn&rsquo;t reach the shared backend: {error}
        </p>
      ) : (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading shared data…
        </div>
      )}
    </div>
  );
}
