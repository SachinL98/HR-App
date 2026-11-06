/**
 * Seamless Source HR: one unbroken "S" stroke (work flowing smoothly) with a small spark.
 * The tile follows the company's main colour and the spark its highlight colour.
 * `light` is for use on a coloured background.
 */
export function LogoMark({ size = 36, light = false }: { size?: number; light?: boolean }) {
  const fg = light ? "#fff" : "var(--primary-fg, #fff)";
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 32 32" className="shrink-0">
      <rect width="32" height="32" rx="9" fill={light ? "rgb(255 255 255 / 0.2)" : "var(--primary, #3B3FD8)"} />
      <path d="M21.8 10.6c-1.2-2.4-3.4-3.4-5.8-3.4-3.1 0-5.1 1.6-5.1 3.9 0 2.5 2.2 3.3 5.2 4 3.2.7 5.6 1.8 5.6 4.6 0 2.8-2.5 4.5-5.8 4.5-2.9 0-5.2-1.2-6.3-3.5" fill="none" stroke={fg} strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="25.5" cy="7" r="2.6" fill={light ? "#fff" : "var(--accent, #14B8A6)"} />
    </svg>
  );
}

export function Logo({ size = 36, light = false, className = "" }: { size?: number; light?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} light={light} />
      <span className="font-semibold leading-tight tracking-tight" style={{ fontSize: size * 0.4 }}>
        Seamless Source <span className="opacity-70">HR</span>
      </span>
    </span>
  );
}
