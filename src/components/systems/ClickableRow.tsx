"use client";

import { useRouter } from "next/navigation";
import type { ReactNode, KeyboardEvent } from "react";

/** A table row that navigates to `href` when clicked anywhere on it (not just a
 * specific cell or icon), used consistently across every source-system list. */
export function ClickableRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();

  function handleKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter") router.push(href);
  }

  return (
    <tr
      onClick={() => router.push(href)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="link"
      className="group cursor-pointer border-b border-border last:border-0 hover:bg-brand-50/40 focus:bg-brand-50/40 outline-none transition-colors"
    >
      {children}
    </tr>
  );
}
