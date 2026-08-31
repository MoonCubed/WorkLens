"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { useWorkLog } from "@/store/work-log-store";

/** A single shared comment thread for a task, keyed by "<employeeId>:<itemId>" — both
 * the employee and their supervisor read and write the same thread, each entry tagged
 * with who wrote it and when, so either side always sees the full conversation. */
export function CommentsThread({ workLogKey, currentUserName }: { workLogKey: string; currentUserName: string }) {
  const { getEntry, addComment } = useWorkLog();
  const entry = getEntry(workLogKey);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

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

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          className="input"
        />
        <button
          disabled={sending}
          onClick={async () => {
            if (!draft.trim()) return;
            setSending(true);
            try {
              await addComment(workLogKey, draft.trim(), currentUserName);
              setDraft("");
            } catch {
              // Ignore — the input keeps the draft so the user can retry.
            } finally {
              setSending(false);
            }
          }}
          className="shrink-0 rounded-lg bg-brand-800 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
