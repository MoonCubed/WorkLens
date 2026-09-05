"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

/**
 * A blocking yes/no prompt shown BEFORE an irreversible or outward-facing action
 * (approving/declining a request, applying a coverage plan). Rendered as a fixed
 * overlay; the caller owns the open/closed state.
 *
 * When `requireReason` is set the dialog also collects a mandatory justification —
 * used for rejections, where a reason must be entered *before* the final confirm and
 * is passed back through `onConfirm(reason)`.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  busy = false,
  requireReason = false,
  reasonLabel = "Justification",
  reasonPlaceholder = "Explain the decision — the employee will see this reason.",
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const confirmClass =
    tone === "danger" ? "bg-[var(--status-critical)] hover:opacity-90" : "bg-brand-800 hover:bg-brand-700";
  const blocked = busy || (requireReason && reason.trim().length === 0);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={busy ? undefined : onCancel}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <div className="mt-2 text-xs leading-relaxed text-ink-secondary">{body}</div>

        {requireReason && (
          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-secondary">{reasonLabel}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder={reasonPlaceholder}
              className="input resize-none text-sm"
            />
            {reason.trim().length === 0 && <span className="mt-1 block text-[11px] text-ink-muted">Required.</span>}
          </label>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-xs font-medium text-ink hover:bg-brand-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
            disabled={blocked}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 ${confirmClass}`}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
