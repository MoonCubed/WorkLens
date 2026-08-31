"use client";

import { useId } from "react";

/**
 * Icon-only mark: three colored signal lines (blue, green, navy) converging
 * into a glass camera-lens ring — the WorkLens brand mark.
 */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const uid = useId();
  const blueLine = `blueLine-${uid}`;
  const greenLine = `greenLine-${uid}`;
  const navyLine = `navyLine-${uid}`;
  const outputLine = `outputLine-${uid}`;
  const lensRing = `lensRing-${uid}`;
  const lensCore = `lensCore-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={blueLine} x1="10" y1="14" x2="40" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2fc7f0" />
          <stop offset="100%" stopColor="#2f7ff0" />
        </linearGradient>
        <linearGradient id={greenLine} x1="8" y1="32" x2="40" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8bd34a" />
          <stop offset="100%" stopColor="#4caf50" />
        </linearGradient>
        <linearGradient id={navyLine} x1="10" y1="50" x2="40" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3a5a8c" />
          <stop offset="100%" stopColor="#123f7d" />
        </linearGradient>
        <linearGradient id={outputLine} x1="44" y1="32" x2="60" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4caf50" />
          <stop offset="100%" stopColor="#123f7d" />
        </linearGradient>
        <linearGradient id={lensRing} x1="33" y1="21" x2="55" y2="43" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2fa8f0" />
          <stop offset="100%" stopColor="#4caf50" />
        </linearGradient>
        <radialGradient id={lensCore} cx="0.35" cy="0.35" r="0.75">
          <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="100%" stopColor="rgba(196,230,255,0.2)" />
        </radialGradient>
      </defs>

      <path d="M14 14 C 22 14, 26 20, 32.5 26" stroke={`url(#${blueLine})`} strokeWidth="4.25" strokeLinecap="round" />
      <circle cx="10" cy="14" r="4.5" fill="#2fc7f0" />

      <path d="M12.5 32 H 34" stroke={`url(#${greenLine})`} strokeWidth="4.25" strokeLinecap="round" />
      <circle cx="8" cy="32" r="4.5" fill="#6cc24a" />

      <path d="M14 50 C 22 50, 26 44, 32.5 38" stroke={`url(#${navyLine})`} strokeWidth="4.25" strokeLinecap="round" />
      <circle cx="10" cy="50" r="4.5" fill="#132a54" />

      <path d="M55 32 H 60" stroke={`url(#${outputLine})`} strokeWidth="4.25" strokeLinecap="round" />
      <circle cx="60" cy="32" r="2.5" fill="#123f7d" />

      <circle cx="44" cy="32" r="11" fill="none" stroke={`url(#${lensRing})`} strokeWidth="3.75" />
      <circle cx="44" cy="32" r="5.25" fill={`url(#${lensCore})`} />
    </svg>
  );
}

/**
 * Full lockup: icon mark + "WorkLens" wordmark, "Lens" rendered in the
 * brand gradient.
 */
export function Logo({
  size = 28,
  textClassName = "text-lg",
  className = "",
  dark = false,
}: {
  size?: number;
  textClassName?: string;
  className?: string;
  /** Use on dark backgrounds (e.g. the WorkLens landing page hero). */
  dark?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className={`font-semibold tracking-tight ${textClassName}`}>
        <span className={dark ? "text-white" : "text-ink"}>Work</span>
        <span className="text-gradient-brand">Lens</span>
      </span>
    </span>
  );
}
