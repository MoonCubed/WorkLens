"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { useWorkLog } from "@/store/work-log-store";
import { withErrorDetail } from "@/lib/errorMessage";

/** A single shared comment thread for a task, keyed by "<employeeId>:<itemId>" — both
 * the employee and their supervisor read and write the same thread, each entry tagged
 * with who wrote it and when, so either side always sees the full conversation. */
export function CommentsThread({ workLogKey, currentUserName }: { workLogKey: string; currentUserName: string }) {
  const { getEntry, addComment } = useWorkLog();
  const entry = getEntry(workLogKey);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {entry.comments.length > 0 && (
        <ul className="space-y-2.5">
          {entry.comments.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-ink-muted" />
              <p className="text-ink-secondary">
                <span className="font-medium text-ink">{c.author}</span>
                <span className="text-ink-muted"> · {c.at}</span>
                <br />
                {c.text}
              </p>
            </li>
          ))}
        </ul>
      )}
      {entry.comments.length === 0 && <p className="text-xs text-ink-muted">No comments yet.</p>}

      {error && (
        <p className="rounded-md border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] px-2.5 py-1.5 text-xs text-[var(--status-critical)]">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !sending && draft.trim() && submit()}
          placeholder="Add a comment…"
          className="input"
        />
        <button disabled={sending || !draft.trim()} onClick={submit} className="shrink-0 rounded-lg bg-brand-800 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {sending ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );

  async function submit() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError(null);
    const text = draft.trim();
    try {
      await addComment(workLogKey, text, currentUserName);
      setDraft("");
    } catch (err) {
      console.error("Failed to save comment", err);
      setError(withErrorDetail("Couldn't save this comment", err));
    } finally {
      setSending(false);
    }
  }
}
