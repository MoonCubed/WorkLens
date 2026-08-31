import { Sparkles } from "lucide-react";

export function AiTag({ label = "AI-assisted" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
      <Sparkles className="h-3 w-3" strokeWidth={2} />
      {label}
    </span>
  );
}
