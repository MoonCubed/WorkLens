"use client";

import { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";

/** A simple single-line info popover — for explanations that don't need the
 * WHAT/HOW/EXAMPLE structure KpiInfo uses (e.g. distinguishing two similar fields). */
export function InfoTip({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="More information"
        className="text-ink-muted hover:text-brand-600"
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      {open && (
        <div
          className={`absolute z-50 mt-2 w-56 rounded-lg border border-border bg-surface p-3 text-left shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <p className="text-xs leading-relaxed text-ink">{text}</p>
        </div>
      )}
    </div>
  );
}
